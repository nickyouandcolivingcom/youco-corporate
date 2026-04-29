import { Router } from "express";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { energyAccounts, energyReadings, energyInvoices } from "@shared/schema";
import { requireAdmin, requireContributor } from "../middleware/auth.js";
import { logAudit } from "../audit.js";
import {
  fetchAccount,
  fetchElectricityConsumption,
  fetchGasConsumption,
  aggregateToDaily,
  pickActiveAgreement,
  pickActiveMeterPoint,
} from "../octopus.js";

const router = Router();

// ─── POST /api/octopus/discover ───────────────────────────────────────────────
//
// Walks every Octopus energy_account that has an account_number, calls the
// Octopus accounts endpoint, and back-fills mpan, mprn, electricity meter
// serial, gas meter serial, fuel type, and tariff code. Picks the *active*
// meter point (one with a current agreement) — not the first in the array,
// which can be a closed historical supply.

router.post("/discover", requireContributor, async (req, res) => {
  const accounts = await db
    .select()
    .from(energyAccounts)
    .where(eq(energyAccounts.supplier, "Octopus"));

  const results: Array<{
    accountNumber: string;
    propertyCode: string;
    status: "ok" | "error" | "skipped";
    mpan?: string | null;
    mprn?: string | null;
    electricityMeterSerial?: string | null;
    gasMeterSerial?: string | null;
    fuelType?: string;
    tariffCode?: string | null;
    error?: string;
  }> = [];

  for (const acc of accounts) {
    if (!acc.accountNumber) {
      results.push({
        accountNumber: "(missing)",
        propertyCode: acc.propertyCode,
        status: "skipped",
        error: "No account number on row",
      });
      continue;
    }
    try {
      const data = await fetchAccount(acc.accountNumber);
      const property = data.properties[0];
      if (!property) {
        results.push({
          accountNumber: acc.accountNumber,
          propertyCode: acc.propertyCode,
          status: "error",
          error: "No properties on account",
        });
        continue;
      }

      const elec = pickActiveMeterPoint(property.electricity_meter_points);
      const gas = pickActiveMeterPoint(property.gas_meter_points);

      // A serial of "NOTINSTALLED" (or empty/null) means no smart meter is
      // fitted to that supply — the supply exists in Octopus's records but
      // there's no meter that the API can return half-hourly data for.
      // Treat as no real serial and let Sync skip that fuel. Manual readings
      // can still be entered against the supply via the Readings table.
      const realSerial = (s: string | undefined | null) => {
        if (!s) return null;
        const upper = s.trim().toUpperCase();
        if (upper === "" || upper === "NOTINSTALLED" || upper === "NOT INSTALLED") return null;
        return s;
      };

      const mpan = elec?.mpan ?? null;
      const mprn = gas?.mprn ?? null;
      const elecSerial = realSerial(elec?.meters[0]?.serial_number);
      const gasSerial = realSerial(gas?.meters[0]?.serial_number);
      const tariffCode = elec
        ? pickActiveAgreement(elec.agreements)?.tariff_code ?? null
        : gas
          ? pickActiveAgreement(gas.agreements)?.tariff_code ?? null
          : null;

      // Fuel type reflects what we can actually read via API (real serial
      // present), not the supply registration. A property with a registered
      // gas MPRN but no installed gas smart meter is treated as Electricity.
      const hasRealElec = !!(mpan && elecSerial);
      const hasRealGas = !!(mprn && gasSerial);
      const fuelType =
        hasRealElec && hasRealGas
          ? "Dual"
          : hasRealGas
            ? "Gas"
            : hasRealElec
              ? "Electricity"
              : // Fallback: keep whatever's there in case the property has neither
                acc.fuelType ?? "Electricity";

      await db
        .update(energyAccounts)
        .set({
          mpan,
          mprn,
          electricityMeterSerial: elecSerial,
          gasMeterSerial: gasSerial,
          tariffCode,
          fuelType,
          updatedAt: sql`now()`,
        })
        .where(eq(energyAccounts.id, acc.id));

      results.push({
        accountNumber: acc.accountNumber,
        propertyCode: acc.propertyCode,
        status: "ok",
        mpan,
        mprn,
        electricityMeterSerial: elecSerial,
        gasMeterSerial: gasSerial,
        fuelType,
        tariffCode,
      });
    } catch (err) {
      results.push({
        accountNumber: acc.accountNumber,
        propertyCode: acc.propertyCode,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "updated",
    entity: "energy_accounts",
    entityId: null,
    fieldChanged: null,
    oldValue: null,
    newValue: `Octopus discover: ${results.filter((r) => r.status === "ok").length}/${accounts.length} ok`,
  });

  res.json({
    total: accounts.length,
    ok: results.filter((r) => r.status === "ok").length,
    errors: results.filter((r) => r.status === "error").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    results,
  });
});

// ─── POST /api/octopus/sync ───────────────────────────────────────────────────
//
// For every Octopus account with mpan + electricity_meter_serial, fetches
// half-hourly electricity consumption and stores daily totals (fuel_type =
// "Electricity"). For every account with mprn + gas_meter_serial, does the
// same for gas. Dual-fuel accounts produce two summary rows.

const syncSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  accountId: z.number().int().optional(),
});

interface SyncSummaryRow {
  accountId: number;
  accountNumber: string | null;
  propertyCode: string;
  fuelType: "Electricity" | "Gas";
  status: "ok" | "skipped" | "error";
  daysWritten?: number;
  totalKwh?: number;
  error?: string;
}

router.post("/sync", requireContributor, async (req, res) => {
  const parsed = syncSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { from, to, accountId } = parsed.data;

  const periodFrom = `${from}T00:00:00Z`;
  const periodTo = `${to}T23:59:59Z`;

  const where = accountId
    ? and(eq(energyAccounts.id, accountId), eq(energyAccounts.supplier, "Octopus"))!
    : eq(energyAccounts.supplier, "Octopus");

  const accounts = await db.select().from(energyAccounts).where(where);

  const summary: SyncSummaryRow[] = [];

  async function syncFuel(
    acc: typeof accounts[number],
    fuel: "Electricity" | "Gas",
    fetcher: () => Promise<Awaited<ReturnType<typeof fetchElectricityConsumption>>>
  ) {
    try {
      const rows = await fetcher();
      const daily = aggregateToDaily(rows);
      let written = 0;
      let totalKwh = 0;
      for (const [readingDate, kwh] of daily) {
        const kwhStr = kwh.toFixed(4);
        await db
          .insert(energyReadings)
          .values({
            energyAccountId: acc.id,
            fuelType: fuel,
            readingDate,
            kwh: kwhStr,
            source: "octopus_api",
          })
          .onConflictDoUpdate({
            target: [
              energyReadings.energyAccountId,
              energyReadings.fuelType,
              energyReadings.readingDate,
            ],
            set: { kwh: kwhStr, source: "octopus_api", updatedAt: sql`now()` },
          });
        written += 1;
        totalKwh += kwh;
      }
      summary.push({
        accountId: acc.id,
        accountNumber: acc.accountNumber,
        propertyCode: acc.propertyCode,
        fuelType: fuel,
        status: "ok",
        daysWritten: written,
        totalKwh: Number(totalKwh.toFixed(4)),
      });
    } catch (err) {
      summary.push({
        accountId: acc.id,
        accountNumber: acc.accountNumber,
        propertyCode: acc.propertyCode,
        fuelType: fuel,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  for (const acc of accounts) {
    let touched = false;

    if (acc.mpan && acc.electricityMeterSerial) {
      await syncFuel(acc, "Electricity", () =>
        fetchElectricityConsumption(
          acc.mpan!,
          acc.electricityMeterSerial!,
          periodFrom,
          periodTo
        )
      );
      touched = true;
    }
    if (acc.mprn && acc.gasMeterSerial) {
      await syncFuel(acc, "Gas", () =>
        fetchGasConsumption(
          acc.mprn!,
          acc.gasMeterSerial!,
          periodFrom,
          periodTo
        )
      );
      touched = true;
    }

    if (!touched) {
      summary.push({
        accountId: acc.id,
        accountNumber: acc.accountNumber,
        propertyCode: acc.propertyCode,
        fuelType: "Electricity",
        status: "skipped",
        error: "No mpan/mprn + meter serial — run /discover first",
      });
      continue;
    }

    await db
      .update(energyAccounts)
      .set({ lastSyncAt: sql`now()` })
      .where(eq(energyAccounts.id, acc.id));
  }

  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "created",
    entity: "energy_readings",
    entityId: null,
    fieldChanged: null,
    oldValue: null,
    newValue: `Octopus sync ${from}→${to}: ${summary.filter((s) => s.status === "ok").length}/${summary.length} fuel-rows ok`,
  });

  res.json({
    period: { from, to },
    accountsTotal: accounts.length,
    fuelRowsTotal: summary.length,
    ok: summary.filter((s) => s.status === "ok").length,
    errors: summary.filter((s) => s.status === "error").length,
    skipped: summary.filter((s) => s.status === "skipped").length,
    summary,
  });
});

// ─── POST /api/octopus/import-consumption-csv ─────────────────────────────────
//
// Fallback for accounts where /consumption/ API returns empty even though
// HH data exists in Octopus's system (some accounts behave this way for
// reasons that aren't always clear — possibly old SMETS1 meters, separate
// auth, or account-level quirks).
//
// User downloads the half-hourly CSV from the Octopus dashboard ("Energy
// geek on" section) and uploads it here. Same shape as the API would have
// returned: half-hourly rows that we aggregate to daily and upsert into
// energy_readings.

const importCsvSchema = z.object({
  accountId: z.number().int(),
  fuelType: z.enum(["Electricity", "Gas"]),
  csvText: z.string().min(1),
});

router.post("/import-consumption-csv", requireContributor, async (req, res) => {
  const parsed = importCsvSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { accountId, fuelType, csvText } = parsed.data;

  const [acc] = await db
    .select()
    .from(energyAccounts)
    .where(eq(energyAccounts.id, accountId));
  if (!acc) return res.status(404).json({ error: "Account not found" });

  // Parse Octopus consumption CSV. Header:
  //   Consumption (kwh), Estimated Cost Inc. Tax (p), Standing Charge Inc. Tax (p), Start, End
  // Half-hourly rows. Aggregate by date prefix of Start (YYYY-MM-DD).
  const lines = csvText.split(/\r?\n/);
  const daily = new Map<string, { kwh: number; costPence: number }>();
  let parsed_rows = 0;
  let skipped_rows = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(",").map((c) => c.trim());
    if (cols.length < 4) {
      skipped_rows += 1;
      continue;
    }
    const consumption = Number(cols[0]);
    const costPence = Number(cols[1]);
    const start = cols[3];
    if (Number.isNaN(consumption) || !start) {
      skipped_rows += 1;
      continue;
    }
    const dateKey = start.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      skipped_rows += 1;
      continue;
    }
    const cur = daily.get(dateKey) ?? { kwh: 0, costPence: 0 };
    cur.kwh += consumption;
    cur.costPence += Number.isNaN(costPence) ? 0 : costPence;
    daily.set(dateKey, cur);
    parsed_rows += 1;
  }

  let written = 0;
  let totalKwh = 0;
  for (const [readingDate, agg] of daily) {
    const kwhStr = agg.kwh.toFixed(4);
    const costStr = agg.costPence.toFixed(2);
    await db
      .insert(energyReadings)
      .values({
        energyAccountId: accountId,
        fuelType,
        readingDate,
        kwh: kwhStr,
        costPence: costStr,
        source: "octopus_api",
      })
      .onConflictDoUpdate({
        target: [
          energyReadings.energyAccountId,
          energyReadings.fuelType,
          energyReadings.readingDate,
        ],
        set: {
          kwh: kwhStr,
          costPence: costStr,
          source: "octopus_api",
          updatedAt: sql`now()`,
        },
      });
    written += 1;
    totalKwh += agg.kwh;
  }

  await db
    .update(energyAccounts)
    .set({ lastSyncAt: sql`now()` })
    .where(eq(energyAccounts.id, accountId));

  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "created",
    entity: "energy_readings",
    entityId: accountId,
    fieldChanged: null,
    oldValue: null,
    newValue: `CSV import (${fuelType}): ${written} days from ${parsed_rows} half-hour rows`,
  });

  res.json({
    accountId,
    propertyCode: acc.propertyCode,
    fuelType,
    halfHourlyRowsParsed: parsed_rows,
    halfHourlyRowsSkipped: skipped_rows,
    daysWritten: written,
    totalKwh: Number(totalKwh.toFixed(4)),
  });
});

// ─── GET /api/octopus/analytics ───────────────────────────────────────────────
//
// Returns daily kWh per (property_code, fuel_type) within a date range.
// Frontend aggregates further (weekly/monthly) based on range length.

router.get("/analytics", requireContributor, async (req, res) => {
  const from = (req.query.from as string | undefined)?.trim();
  const to = (req.query.to as string | undefined)?.trim();
  const fuelType = (req.query.fuelType as string | undefined)?.trim();

  if (!from || !to) {
    return res.status(400).json({ error: "from and to query params required" });
  }

  const conditions = [
    gte(energyReadings.readingDate, from),
    lte(energyReadings.readingDate, to),
  ];
  if (fuelType) conditions.push(eq(energyReadings.fuelType, fuelType));

  const rows = await db
    .select({
      readingDate: energyReadings.readingDate,
      fuelType: energyReadings.fuelType,
      kwh: energyReadings.kwh,
      energyAccountId: energyReadings.energyAccountId,
      propertyCode: energyAccounts.propertyCode,
    })
    .from(energyReadings)
    .innerJoin(
      energyAccounts,
      eq(energyAccounts.id, energyReadings.energyAccountId)
    )
    .where(and(...conditions))
    .orderBy(energyReadings.readingDate);

  res.json({
    period: { from, to, fuelType: fuelType ?? null },
    rowCount: rows.length,
    rows,
  });
});

// ─── GET /api/octopus/readings ────────────────────────────────────────────────

router.get("/readings", requireContributor, async (req, res) => {
  const accountId = req.query.accountId
    ? parseInt(req.query.accountId as string, 10)
    : null;
  const fuelType = (req.query.fuelType as string | undefined)?.trim();
  const from = (req.query.from as string | undefined)?.trim();
  const to = (req.query.to as string | undefined)?.trim();

  const conditions = [];
  if (accountId) conditions.push(eq(energyReadings.energyAccountId, accountId));
  if (fuelType) conditions.push(eq(energyReadings.fuelType, fuelType));
  if (from) conditions.push(gte(energyReadings.readingDate, from));
  if (to) conditions.push(lte(energyReadings.readingDate, to));

  const rows = conditions.length
    ? await db
        .select()
        .from(energyReadings)
        .where(and(...conditions))
        .orderBy(energyReadings.readingDate)
    : await db
        .select()
        .from(energyReadings)
        .orderBy(energyReadings.readingDate);

  res.json(rows);
});

// ─── GET /api/octopus/reconcile/:invoiceId ────────────────────────────────────

router.get("/reconcile/:invoiceId", requireContributor, async (req, res) => {
  const id = parseInt(req.params.invoiceId as string, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [inv] = await db
    .select()
    .from(energyInvoices)
    .where(eq(energyInvoices.id, id));
  if (!inv) return res.status(404).json({ error: "Invoice not found" });

  if (!inv.energyAccountId) {
    return res.json({
      invoice: inv,
      readings: null,
      delta: null,
      message: "Invoice not linked to an energy account — set energyAccountId first.",
    });
  }

  const readings = await db
    .select()
    .from(energyReadings)
    .where(
      and(
        eq(energyReadings.energyAccountId, inv.energyAccountId),
        gte(energyReadings.readingDate, inv.periodStart),
        lte(energyReadings.readingDate, inv.periodEnd)
      )
    )
    .orderBy(energyReadings.readingDate);

  const byFuel = new Map<string, number>();
  for (const r of readings) {
    byFuel.set(r.fuelType, (byFuel.get(r.fuelType) ?? 0) + Number(r.kwh));
  }
  const readingsKwh = Array.from(byFuel.values()).reduce((a, b) => a + b, 0);
  const invoiceKwh = inv.kwh != null ? Number(inv.kwh) : null;

  res.json({
    invoice: inv,
    readingsCount: readings.length,
    readingsKwhByFuel: Object.fromEntries(byFuel),
    readingsKwhTotal: Number(readingsKwh.toFixed(4)),
    invoiceKwh,
    deltaKwh:
      invoiceKwh !== null
        ? Number((readingsKwh - invoiceKwh).toFixed(4))
        : null,
    readings,
  });
});

router.delete("/readings", requireAdmin, async (_req, res) => {
  const result = await db.delete(energyReadings).returning();
  res.json({ deleted: result.length });
});

export default router;
