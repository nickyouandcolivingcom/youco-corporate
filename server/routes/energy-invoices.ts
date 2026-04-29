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

// ─── DELETE /api/energy-invoices (clear all — admin only) ─────────────────────

router.delete("/", requireAdmin, async (_req, res) => {
  const result = await db.delete(energyInvoices).returning();
  res.json({ deleted: result.length });
});

export default router;
