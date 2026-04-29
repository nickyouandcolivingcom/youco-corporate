import { Router } from "express";
import { eq, ilike, or, sql, and, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { energyInvoices, INVOICE_SOURCES } from "@shared/schema";
import { PROPERTY_CODE_VALUES } from "@shared/property-codes";
import { requireAuth, requireContributor, requireAdmin } from "../middleware/auth.js";
import { logAudit, logFieldChanges } from "../audit.js";

const router = Router();

const numStr = z
  .union([z.string(), z.number()])
  .nullable()
  .optional()
  .transform((v) => (v === null || v === undefined || v === "" ? null : String(v)));

const upsertSchema = z.object({
  energyAccountId: z.number().int().nullable().optional(),
  propertyCode: z.enum(PROPERTY_CODE_VALUES as [string, ...string[]]),
  supplier: z.string().min(1),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  kwh: numStr,
  electricityKwh: numStr,
  gasKwh: numStr,
  amount: z.union([z.string(), z.number()]).transform((v) => String(v)),
  electricityAmount: numStr,
  gasAmount: numStr,
  vatAmount: numStr,
  invoiceNumber: z.string().nullable().optional(),
  source: z.enum(INVOICE_SOURCES).default("manual"),
  notes: z.string().nullable().optional(),
  eReadingType: z.string().nullable().optional(),
  gReadingType: z.string().nullable().optional(),
  eReadingDate: z.string().nullable().optional(),
  gReadingDate: z.string().nullable().optional(),
});

// ─── GET /api/energy-invoices ─────────────────────────────────────────────────

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
        ilike(energyInvoices.propertyCode, `%${search}%`),
        ilike(energyInvoices.supplier, `%${search}%`),
        ilike(energyInvoices.invoiceNumber, `%${search}%`)
      )!
    );
  }
  if (propertyCode) conditions.push(eq(energyInvoices.propertyCode, propertyCode));
  if (supplier) conditions.push(eq(energyInvoices.supplier, supplier));
  if (fromDate) conditions.push(gte(energyInvoices.periodStart, fromDate));
  if (toDate) conditions.push(lte(energyInvoices.periodEnd, toDate));

  const rows = conditions.length
    ? await db
        .select()
        .from(energyInvoices)
        .where(and(...conditions))
        .orderBy(energyInvoices.periodStart, energyInvoices.propertyCode)
    : await db
        .select()
        .from(energyInvoices)
        .orderBy(energyInvoices.periodStart, energyInvoices.propertyCode);

  res.json(rows);
});

// ─── POST /api/energy-invoices/csv-import ─────────────────────────────────────

router.post("/csv-import", requireContributor, async (req, res) => {
  const parsed = z.array(upsertSchema).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const rows = parsed.data.map((r) => ({
    energyAccountId: r.energyAccountId ?? null,
    propertyCode: r.propertyCode,
    supplier: r.supplier,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    kwh: r.kwh ?? null,
    electricityKwh: r.electricityKwh ?? null,
    gasKwh: r.gasKwh ?? null,
    amount: r.amount,
    electricityAmount: r.electricityAmount ?? null,
    gasAmount: r.gasAmount ?? null,
    vatAmount: r.vatAmount ?? null,
    invoiceNumber: r.invoiceNumber ?? null,
    source: r.source ?? "csv_import",
    eReadingType: r.eReadingType ?? null,
    gReadingType: r.gReadingType ?? null,
    eReadingDate: r.eReadingDate ?? null,
    gReadingDate: r.gReadingDate ?? null,
    notes: r.notes ?? null,
    updatedAt: sql`now()`,
  }));

  if (rows.length === 0) return res.json({ inserted: 0 });

  await db.insert(energyInvoices).values(rows);

  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "created",
    entity: "energy_invoices",
    entityId: null,
    fieldChanged: null,
    oldValue: null,
    newValue: `CSV import: ${rows.length} rows`,
  });

  res.json({ inserted: rows.length });
});

// ─── POST /api/energy-invoices ────────────────────────────────────────────────

router.post("/", requireContributor, async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const [row] = await db
    .insert(energyInvoices)
    .values({ ...parsed.data, updatedAt: sql`now()` })
    .returning();

  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "created",
    entity: "energy_invoices",
    entityId: row.id,
    fieldChanged: null,
    oldValue: null,
    newValue: `${row.supplier} / ${row.propertyCode} / ${row.periodStart}`,
  });

  res.status(201).json(row);
});

// ─── PATCH /api/energy-invoices/:id ───────────────────────────────────────────

router.patch("/:id", requireContributor, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const parsed = upsertSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const [existing] = await db
    .select()
    .from(energyInvoices)
    .where(eq(energyInvoices.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });

  const [updated] = await db
    .update(energyInvoices)
    .set({ ...parsed.data, updatedAt: sql`now()` })
    .where(eq(energyInvoices.id, id))
    .returning();

  const fields = Object.keys(parsed.data) as Array<keyof typeof parsed.data>;
  await logFieldChanges(
    {
      userId: req.user!.id,
      userName: req.user!.username,
      entity: "energy_invoices",
      entityId: id,
    },
    fields.map((f) => ({
      field: f,
      oldValue: existing[f as keyof typeof existing] ?? null,
      newValue: parsed.data[f] ?? null,
    }))
  );

  res.json(updated);
});

// ─── DELETE /api/energy-invoices/:id ──────────────────────────────────────────

router.delete("/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [existing] = await db
    .select()
    .from(energyInvoices)
    .where(eq(energyInvoices.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });

  await db.delete(energyInvoices).where(eq(energyInvoices.id, id));

  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "deleted",
    entity: "energy_invoices",
    entityId: id,
    fieldChanged: null,
    oldValue: `${existing.supplier} / ${existing.propertyCode} / ${existing.periodStart}`,
    newValue: null,
  });

  res.json({ deleted: true });
});

// ─── POST /api/energy-invoices/bulk-import ────────────────────────────────────
//
// Long-format CSV bulk importer for invoices (typical EON / multi-supplier
// use case). Each row is one invoice. Detects duplicates by
// (property_code, supplier, period_start, period_end) and reports gaps in
// monthly coverage.

const bulkRowSchema = z.object({
  propertyCode: z.enum(PROPERTY_CODE_VALUES as [string, ...string[]]),
  supplier: z.string().min(1),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.union([z.string(), z.number()]).transform((v) => String(v)),
  electricityKwh: numStr,
  gasKwh: numStr,
  electricityAmount: numStr,
  gasAmount: numStr,
  vatAmount: numStr,
  invoiceNumber: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const bulkImportSchema = z.object({
  rows: z.array(bulkRowSchema),
});

router.post("/bulk-import", requireContributor, async (req, res) => {
  const parsed = bulkImportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const incoming = parsed.data.rows;
  if (incoming.length === 0) {
    return res.json({
      received: 0,
      inserted: 0,
      skippedDuplicates: 0,
      duplicates: [],
      gaps: [],
    });
  }

  const suppliers = [...new Set(incoming.map((r) => r.supplier))];
  const properties = [...new Set(incoming.map((r) => r.propertyCode))];
  const minStart = incoming.reduce(
    (a, r) => (a < r.periodStart ? a : r.periodStart),
    incoming[0].periodStart
  );
  const maxEnd = incoming.reduce(
    (a, r) => (a > r.periodEnd ? a : r.periodEnd),
    incoming[0].periodEnd
  );

  const existing = await db
    .select()
    .from(energyInvoices)
    .where(
      and(
        gte(energyInvoices.periodStart, minStart),
        lte(energyInvoices.periodEnd, maxEnd)
      )
    );

  const keyOf = (r: {
    propertyCode: string;
    supplier: string;
    periodStart: string;
    periodEnd: string;
  }) => `${r.propertyCode}|${r.supplier}|${r.periodStart}|${r.periodEnd}`;

  const existingKeys = new Set(
    existing
      .filter((e) => suppliers.includes(e.supplier) && properties.includes(e.propertyCode))
      .map((e) => keyOf(e as never))
  );

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
    await db.insert(energyInvoices).values(
      toInsert.map((r) => ({
        propertyCode: r.propertyCode,
        supplier: r.supplier,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        amount: r.amount,
        electricityKwh: r.electricityKwh ?? null,
        gasKwh: r.gasKwh ?? null,
        electricityAmount: r.electricityAmount ?? null,
        gasAmount: r.gasAmount ?? null,
        vatAmount: r.vatAmount ?? null,
        invoiceNumber: r.invoiceNumber ?? null,
        notes: r.notes ?? null,
        source: "csv_import" as const,
        updatedAt: sql`now()`,
      }))
    );
  }

  // Gap analysis: per (supplier × property), find months with no invoice
  // between min and max known periods.
  const allRows = await db
    .select()
    .from(energyInvoices)
    .where(
      and(
        gte(energyInvoices.periodStart, minStart),
        lte(energyInvoices.periodEnd, maxEnd)
      )
    );

  function monthKey(d: string) {
    return d.slice(0, 7);
  }
  function* monthsBetween(from: string, to: string) {
    const start = new Date(from + "T00:00:00Z");
    const end = new Date(to + "T00:00:00Z");
    const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    const stop = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    while (cur.getTime() <= stop.getTime()) {
      yield cur.toISOString().slice(0, 7);
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
  }

  const gaps: Array<{ propertyCode: string; supplier: string; missingMonth: string }> = [];
  for (const supplier of suppliers) {
    for (const propertyCode of properties) {
      const relevant = allRows.filter(
        (r) => r.supplier === supplier && r.propertyCode === propertyCode
      );
      if (relevant.length === 0) continue;
      const months = new Set(relevant.map((r) => monthKey(r.periodStart)));
      const minM = relevant.reduce(
        (a, r) => (a < r.periodStart ? a : r.periodStart),
        relevant[0].periodStart
      );
      const maxM = relevant.reduce(
        (a, r) => (a > r.periodEnd ? a : r.periodEnd),
        relevant[0].periodEnd
      );
      for (const m of monthsBetween(minM, maxM)) {
        if (!months.has(m)) {
          gaps.push({ propertyCode, supplier, missingMonth: m });
        }
      }
    }
  }

  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "created",
    entity: "energy_invoices",
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

// ─── DELETE /api/energy-invoices (clear all — admin only) ─────────────────────

router.delete("/", requireAdmin, async (_req, res) => {
  const result = await db.delete(energyInvoices).returning();
  res.json({ deleted: result.length });
});

export default router;
