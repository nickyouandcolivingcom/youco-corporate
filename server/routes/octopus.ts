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
} from "../octopus.js";

const router = Router();

// ─── POST /api/octopus/discover ───────────────────────────────────────────────
//
// Walks every Octopus energy_account that has an account_number, calls the
// Octopus accounts endpoint, and back-fills mpan/mprn, meter_serial, and
// tariff_code. Idempotent — safe to re-run.

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
    meterSerial?: string | null;
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

      // Take the first electricity meter point (most accounts have one).
      const elec = property.electricity_meter_points[0];
      const gas = property.gas_meter_points[0];

      let mpan: string | null = null;
      let mprn: string | null = null;
      let meterSerial: string | null = null;
      let tariffCode: string | null = null;

      if (elec) {
        mpan = elec.mpan;
        meterSerial = elec.meters[0]?.serial_number ?? null;
        tariffCode = pickActiveAgreement(elec.agreements)?.tariff_code ?? null;
      }
      if (gas && !elec) {
        // Gas-only account
        mprn = gas.mprn;
        meterSerial = gas.meters[0]?.serial_number ?? null;
        tariffCode = pickActiveAgreement(gas.agreements)?.tariff_code ?? null;
      } else if (gas && elec) {
        mprn = gas.mprn;
      }

      await db
        .update(energyAccounts)
        .set({
          mpan,
          mprn,
          meterSerial,
          tariffCode,
          fuelType: gas && elec ? "Dual" : gas ? "Gas" : "Electricity",
          updatedAt: sql`now()`,
        })
        .where(eq(energyAccounts.id, acc.id));

      results.push({
        accountNumber: acc.accountNumber,
        propertyCode: acc.propertyCode,
        status: "ok",
        mpan,
        mprn,
        meterSerial,
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
// Pulls half-hourly consumption for all Octopus accounts that have mpan +
// meter_serial set (run /discover first). Aggregates to daily and upserts
// into energy_readings.

const syncSchema = z.object({
  from: z.string().min(1), // YYYY-MM-DD
  to: z.string().min(1),
  accountId: z.number().int().optional(), // sync just one account
});

router.post("/sync", requireContributor, async (req, res) => {
  const parsed = syncSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { from, to, accountId } = parsed.data;

  // Octopus expects ISO-8601 with offset; we send UTC midnight-to-midnight.
  const periodFrom = `${from}T00:00:00Z`;
  const periodTo = `${to}T23:59:59Z`;

  const where = accountId
    ? and(eq(energyAccounts.id, accountId), eq(energyAccounts.supplier, "Octopus"))!
    : eq(energyAccounts.supplier, "Octopus");

  const accounts = await db.select().from(energyAccounts).where(where);

  const summary: Array<{
    accountId: number;
    accountNumber: string | null;
    propertyCode: string;
    status: "ok" | "skipped" | "error";
    daysWritten?: number;
    totalKwh?: number;
    error?: string;
  }> = [];

  for (const acc of accounts) {
    try {
      let rows;
      if (acc.mpan && acc.meterSerial) {
        rows = await fetchElectricityConsumption(
          acc.mpan,
          acc.meterSerial,
          periodFrom,
          periodTo
        );
      } else if (acc.mprn && acc.meterSerial) {
        rows = await fetchGasConsumption(
          acc.mprn,
          acc.meterSerial,
          periodFrom,
          periodTo
        );
      } else {
        summary.push({
          accountId: acc.id,
          accountNumber: acc.accountNumber,
          propertyCode: acc.propertyCode,
          status: "skipped",
          error: "Missing mpan/mprn or meter_serial — run /discover first",
        });
        continue;
      }

      const daily = aggregateToDaily(rows);
      let written = 0;
      let totalKwh = 0;
      for (const [readingDate, kwh] of daily) {
        const kwhStr = kwh.toFixed(4);
        await db
          .insert(energyReadings)
          .values({
            energyAccountId: acc.id,
            readingDate,
            kwh: kwhStr,
            source: "octopus_api",
          })
          .onConflictDoUpdate({
            target: [energyReadings.energyAccountId, energyReadings.readingDate],
            set: { kwh: kwhStr, source: "octopus_api", updatedAt: sql`now()` },
          });
        written += 1;
        totalKwh += kwh;
      }

      await db
        .update(energyAccounts)
        .set({ lastSyncAt: sql`now()` })
        .where(eq(energyAccounts.id, acc.id));

      summary.push({
        accountId: acc.id,
        accountNumber: acc.accountNumber,
        propertyCode: acc.propertyCode,
        status: "ok",
        daysWritten: written,
        totalKwh: Number(totalKwh.toFixed(4)),
      });
    } catch (err) {
      summary.push({
        accountId: acc.id,
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
    action: "created",
    entity: "energy_readings",
    entityId: null,
    fieldChanged: null,
    oldValue: null,
    newValue: `Octopus sync ${from}→${to}: ${summary.filter((s) => s.status === "ok").length}/${accounts.length} ok`,
  });

  res.json({
    period: { from, to },
    total: accounts.length,
    ok: summary.filter((s) => s.status === "ok").length,
    errors: summary.filter((s) => s.status === "error").length,
    skipped: summary.filter((s) => s.status === "skipped").length,
    summary,
  });
});

// ─── GET /api/octopus/readings ────────────────────────────────────────────────
//
// Returns daily readings, optionally filtered by account_id and date range.

router.get("/readings", requireContributor, async (req, res) => {
  const accountId = req.query.accountId
    ? parseInt(req.query.accountId as string, 10)
    : null;
  const from = (req.query.from as string | undefined)?.trim();
  const to = (req.query.to as string | undefined)?.trim();

  const conditions = [];
  if (accountId) conditions.push(eq(energyReadings.energyAccountId, accountId));
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
//
// Compares an invoice's £/kWh total against the sum of daily readings for
// the same account over the invoice period. Useful sanity check.

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

  const readingsKwh = readings.reduce((acc, r) => acc + Number(r.kwh), 0);
  const invoiceKwh = inv.kwh != null ? Number(inv.kwh) : null;

  res.json({
    invoice: inv,
    readingsCount: readings.length,
    readingsKwh: Number(readingsKwh.toFixed(4)),
    invoiceKwh,
    deltaKwh:
      invoiceKwh !== null
        ? Number((readingsKwh - invoiceKwh).toFixed(4))
        : null,
    readings,
  });
});

// ─── DELETE /api/octopus/readings (admin only — for clean re-sync) ────────────

router.delete("/readings", requireAdmin, async (_req, res) => {
  const result = await db.delete(energyReadings).returning();
  res.json({ deleted: result.length });
});

export default router;
