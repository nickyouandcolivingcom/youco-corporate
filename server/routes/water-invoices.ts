import { Router } from "express";
import { eq, ilike, or, sql, and, gte, lte } from "drizzle-orm";
import { z } from "zod";
import pdfParseLib from "pdf-parse";
import { db } from "../db.js";
import { waterInvoices, waterAccounts, INVOICE_SOURCES } from "@shared/schema";
import { PROPERTY_CODE_VALUES } from "@shared/property-codes";
import { requireAuth, requireContributor, requireAdmin } from "../middleware/auth.js";
import { logAudit } from "../audit.js";
import { parseSevernTrentBill } from "../parsers/severn-trent.js";
import type { WaterInvoiceRow } from "../parsers/water-types.js";

const router = Router();

const numStr = z
  .union([z.string(), z.number()])
  .nullable()
  .optional()
  .transform((v) => (v === null || v === undefined || v === "" ? null : String(v)));

const upsertSchema = z.object({
  waterAccountId: z.number().int().nullable().optional(),
  propertyCode: z.enum(PROPERTY_CODE_VALUES as [string, ...string[]]),
  supplier: z.string().min(1),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  amount: z.union([z.string(), z.number()]).transform((v) => String(v)),
  freshWaterAmount: numStr,
  wastewaterAmount: numStr,
  standingChargeAmount: numStr,
  invoiceNumber: z.string().nullable().optional(),
  issueDate: z.string().nullable().optional(),
  source: z.enum(INVOICE_SOURCES).default("manual"),
  notes: z.string().nullable().optional(),
});

router.get("/", requireAuth, async (req, res) => {
  const search = (req.query.search as string | undefined)?.trim() ?? "";
  const propertyCode = (req.query.propertyCode as string | undefined)?.trim();
  const supplier = (req.query.supplier as string | undefined)?.trim();
  const fromDate = (req.query.from as string | undefined)?.trim();
  const toDate = (req.query.to as string | undefined)?.trim();

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        ilike(waterInvoices.propertyCode, `%${search}%`),
        ilike(waterInvoices.supplier, `%${search}%`),
        ilike(waterInvoices.invoiceNumber, `%${search}%`)
      )!
    );
  }
  if (propertyCode) conditions.push(eq(waterInvoices.propertyCode, propertyCode));
  if (supplier) conditions.push(eq(waterInvoices.supplier, supplier));
  if (fromDate) conditions.push(gte(waterInvoices.periodStart, fromDate));
  if (toDate) conditions.push(lte(waterInvoices.periodEnd, toDate));

  const rows = conditions.length
    ? await db
        .select()
        .from(waterInvoices)
        .where(and(...conditions))
        .orderBy(waterInvoices.periodStart, waterInvoices.propertyCode)
    : await db
        .select()
        .from(waterInvoices)
        .orderBy(waterInvoices.periodStart, waterInvoices.propertyCode);
  res.json(rows);
});

router.post("/", requireContributor, async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const [row] = await db
    .insert(waterInvoices)
    .values({ ...parsed.data, updatedAt: sql`now()` })
    .returning();
  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "created",
    entity: "water_invoices",
    entityId: row.id,
    fieldChanged: null,
    oldValue: null,
    newValue: `${row.supplier} / ${row.propertyCode} / ${row.periodStart}`,
  });
  res.status(201).json(row);
});

router.patch("/:id", requireContributor, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = upsertSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const [existing] = await db.select().from(waterInvoices).where(eq(waterInvoices.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });
  const [updated] = await db
    .update(waterInvoices)
    .set({ ...parsed.data, updatedAt: sql`now()` })
    .where(eq(waterInvoices.id, id))
    .returning();
  res.json(updated);
});

router.delete("/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [existing] = await db.select().from(waterInvoices).where(eq(waterInvoices.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });
  await db.delete(waterInvoices).where(eq(waterInvoices.id, id));
  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "deleted",
    entity: "water_invoices",
    entityId: id,
    fieldChanged: null,
    oldValue: `${existing.supplier} / ${existing.propertyCode} / ${existing.periodStart}`,
    newValue: null,
  });
  res.json({ deleted: true });
});

// ─── POST /api/water-invoices/bulk-import ─────────────────────────────────────

const bulkRowSchema = z.object({
  propertyCode: z.enum(PROPERTY_CODE_VALUES as [string, ...string[]]),
  supplier: z.string().min(1),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.union([z.string(), z.number()]).transform((v) => String(v)),
  freshWaterAmount: numStr,
  wastewaterAmount: numStr,
  standingChargeAmount: numStr,
  invoiceNumber: z.string().nullable().optional(),
  issueDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

router.post("/bulk-import", requireContributor, async (req, res) => {
  const parsed = z.object({ rows: z.array(bulkRowSchema) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const incoming = parsed.data.rows;
  if (incoming.length === 0) {
    return res.json({ received: 0, inserted: 0, skippedDuplicates: 0, duplicates: [], gaps: [] });
  }

  // Dedupe: (property, supplier, period_start, period_end)
  const existing = await db.select().from(waterInvoices);
  const keyOf = (r: { propertyCode: string; supplier: string; periodStart: string; periodEnd: string }) =>
    `${r.propertyCode}|${r.supplier}|${r.periodStart}|${r.periodEnd}`;
  const existingKeys = new Set(existing.map((e) => keyOf(e as never)));

  const toInsert: typeof incoming = [];
  const duplicates: Array<{ row: number; key: string }> = [];
  for (let i = 0; i < incoming.length; i++) {
    const k = keyOf(incoming[i]);
    if (existingKeys.has(k)) {
      duplicates.push({ row: i + 1, key: k });
    } else {
      existingKeys.add(k);
      toInsert.push(incoming[i]);
    }
  }

  if (toInsert.length > 0) {
    await db.insert(waterInvoices).values(
      toInsert.map((r) => ({
        propertyCode: r.propertyCode,
        supplier: r.supplier,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        amount: r.amount,
        freshWaterAmount: r.freshWaterAmount ?? null,
        wastewaterAmount: r.wastewaterAmount ?? null,
        standingChargeAmount: r.standingChargeAmount ?? null,
        invoiceNumber: r.invoiceNumber ?? null,
        issueDate: r.issueDate ?? null,
        notes: r.notes ?? null,
        source: "csv_import" as const,
        updatedAt: sql`now()`,
      }))
    );
  }

  // Gap analysis: water bills are typically annual, so gaps are years.
  // For each (supplier, property), look at min/max billing-period years and
  // flag missing years.
  const allRows = await db.select().from(waterInvoices);
  const suppliers = [...new Set(incoming.map((r) => r.supplier))];
  const properties = [...new Set(incoming.map((r) => r.propertyCode))];
  const gaps: Array<{ propertyCode: string; supplier: string; missingYear: string }> = [];
  for (const supplier of suppliers) {
    for (const propertyCode of properties) {
      const relevant = allRows.filter((r) => r.supplier === supplier && r.propertyCode === propertyCode);
      if (relevant.length === 0) continue;
      const years = new Set(relevant.map((r) => r.periodStart.slice(0, 4)));
      const minYear = parseInt(
        relevant.reduce((a, r) => (a < r.periodStart ? a : r.periodStart), relevant[0].periodStart).slice(0, 4),
        10
      );
      const maxYear = parseInt(
        relevant.reduce((a, r) => (a > r.periodEnd ? a : r.periodEnd), relevant[0].periodEnd).slice(0, 4),
        10
      );
      for (let y = minYear; y < maxYear; y++) {
        if (!years.has(String(y))) {
          gaps.push({ propertyCode, supplier, missingYear: String(y) });
        }
      }
    }
  }

  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "created",
    entity: "water_invoices",
    entityId: null,
    fieldChanged: null,
    oldValue: null,
    newValue: `Bulk import: ${toInsert.length}/${incoming.length} inserted, ${duplicates.length} duplicates`,
  });

  res.json({
    received: incoming.length,
    inserted: toInsert.length,
    skippedDuplicates: duplicates.length,
    duplicates,
    gaps,
  });
});

// ─── POST /api/water-invoices/import-pdfs ─────────────────────────────────────

interface ParserDef {
  supplier: string;
  detect: (text: string) => boolean;
  parse: (
    text: string,
    accountMap: Record<string, string>
  ) => {
    ok: boolean;
    row?: WaterInvoiceRow;
    error?: string;
    accountNumber?: string;
    matchedByAddress?: string;
    supplyAddress?: string;
  };
}

const PARSERS: ParserDef[] = [
  {
    supplier: "Severn Trent",
    detect: (t) => /Severn Trent/i.test(t) || /stwater\.co\.uk/i.test(t),
    parse: parseSevernTrentBill,
  },
];

router.post(
  "/import-pdfs",
  requireContributor,
  async (req, res) => {
    const schema = z.object({
      files: z
        .array(z.object({ name: z.string(), base64: z.string() }))
        .min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }

    // Build a mutable account map so newly-discovered accounts (auto-created
    // mid-loop) are visible to subsequent PDFs in the same batch.
    const accounts = await db.select().from(waterAccounts);
    const accountMap: Record<string, string> = {};
    for (const a of accounts) {
      if (a.accountNumber) accountMap[a.accountNumber] = a.propertyCode;
    }

    const results: Array<{
      file: string;
      supplier?: string;
      accountNumber?: string;
      propertyCode?: string;
      status: "ok" | "error" | "no_parser";
      row?: WaterInvoiceRow;
      error?: string;
      autoCreatedAccount?: boolean;
    }> = [];

    const autoCreatedAccounts: Array<{
      supplier: string;
      propertyCode: string;
      accountNumber: string;
      supplyAddress?: string;
    }> = [];

    for (const f of parsed.data.files) {
      try {
        const buf = Buffer.from(f.base64, "base64");
        const text = (await pdfParseLib(buf)).text;
        const matched = PARSERS.find((p) => p.detect(text));
        if (!matched) {
          results.push({
            file: f.name,
            status: "no_parser",
            error: "No water parser matched (only Severn Trent supported currently)",
          });
          continue;
        }
        const out = matched.parse(text, accountMap);
        if (!out.ok) {
          results.push({
            file: f.name,
            supplier: matched.supplier,
            accountNumber: out.accountNumber,
            status: "error",
            error: out.error,
          });
          continue;
        }

        // If the property was matched via address (not the account map),
        // auto-create the water_account row so subsequent imports skip the
        // address fallback. Updates the in-memory accountMap too so duplicate
        // PDFs in the same batch resolve via the map next time round.
        let autoCreatedAccount = false;
        if (
          out.matchedByAddress &&
          out.accountNumber &&
          !accountMap[out.accountNumber]
        ) {
          await db.insert(waterAccounts).values({
            supplier: matched.supplier,
            propertyCode: out.matchedByAddress,
            accountNumber: out.accountNumber,
            supplyAddress: out.supplyAddress ?? null,
            billingFrequency: "Annual",
            status: "Active",
            notes: "Auto-created from PDF import",
          });
          accountMap[out.accountNumber] = out.matchedByAddress;
          autoCreatedAccount = true;
          autoCreatedAccounts.push({
            supplier: matched.supplier,
            propertyCode: out.matchedByAddress,
            accountNumber: out.accountNumber,
            supplyAddress: out.supplyAddress,
          });
        }

        results.push({
          file: f.name,
          supplier: matched.supplier,
          accountNumber: out.accountNumber,
          propertyCode: out.row?.propertyCode,
          status: "ok",
          row: out.row,
          autoCreatedAccount,
        });
      } catch (err) {
        results.push({
          file: f.name,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const okRows = results.filter((r) => r.status === "ok" && r.row).map((r) => r.row!);

    res.json({
      received: parsed.data.files.length,
      parsed: okRows.length,
      failed: results.filter((r) => r.status !== "ok").length,
      autoCreatedAccounts,
      results,
      rows: okRows,
    });
  }
);

export default router;
