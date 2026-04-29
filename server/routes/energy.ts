import { Router } from "express";
import { eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { energyAccounts, FUEL_TYPES, ENERGY_STATUSES } from "@shared/schema";
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
  supplier: z.string().min(1),
  propertyCode: z.enum(PROPERTY_CODE_VALUES as [string, ...string[]]),
  accountNumber: z.string().nullable().optional(),
  fuelType: z.enum(FUEL_TYPES).default("Electricity"),
  mpan: z.string().nullable().optional(),
  mprn: z.string().nullable().optional(),
  tariffName: z.string().nullable().optional(),
  unitRatePence: numStr,
  standingChargePence: numStr,
  contractEndDate: z.string().nullable().optional(),
  lastReadingValue: numStr,
  lastReadingDate: z.string().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  paymentDay: z.number().int().min(1).max(31).nullable().optional(),
  status: z.enum(ENERGY_STATUSES).default("Active"),
  disputeNotes: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// ─── GET /api/energy ──────────────────────────────────────────────────────────

router.get("/", requireAuth, async (req, res) => {
  const search = (req.query.search as string | undefined)?.trim() ?? "";

  const rows = search
    ? await db
        .select()
        .from(energyAccounts)
        .where(
          or(
            ilike(energyAccounts.supplier, `%${search}%`),
            ilike(energyAccounts.propertyCode, `%${search}%`),
            ilike(energyAccounts.accountNumber, `%${search}%`),
            ilike(energyAccounts.tariffName, `%${search}%`)
          )
        )
        .orderBy(energyAccounts.supplier, energyAccounts.propertyCode)
    : await db
        .select()
        .from(energyAccounts)
        .orderBy(energyAccounts.supplier, energyAccounts.propertyCode);

  res.json(rows);
});

// ─── POST /api/energy/csv-import ──────────────────────────────────────────────

router.post("/csv-import", requireContributor, async (req, res) => {
  const parsed = z.array(upsertSchema).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const rows = parsed.data.map((r) => ({
    supplier: r.supplier,
    propertyCode: r.propertyCode,
    accountNumber: r.accountNumber ?? null,
    fuelType: r.fuelType ?? "Electricity",
    mpan: r.mpan ?? null,
    mprn: r.mprn ?? null,
    tariffName: r.tariffName ?? null,
    unitRatePence: r.unitRatePence ?? null,
    standingChargePence: r.standingChargePence ?? null,
    contractEndDate: r.contractEndDate ?? null,
    lastReadingValue: r.lastReadingValue ?? null,
    lastReadingDate: r.lastReadingDate ?? null,
    paymentMethod: r.paymentMethod ?? null,
    paymentDay: r.paymentDay ?? null,
    status: r.status ?? "Active",
    disputeNotes: r.disputeNotes ?? null,
    notes: r.notes ?? null,
    updatedAt: sql`now()`,
  }));

  if (rows.length === 0) return res.json({ inserted: 0 });

  await db.insert(energyAccounts).values(rows);

  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "created",
    entity: "energy_accounts",
    entityId: null,
    fieldChanged: null,
    oldValue: null,
    newValue: `CSV import: ${rows.length} rows`,
  });

  res.json({ inserted: rows.length });
});

// ─── POST /api/energy ─────────────────────────────────────────────────────────

router.post("/", requireContributor, async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const [row] = await db
    .insert(energyAccounts)
    .values({ ...parsed.data, updatedAt: sql`now()` })
    .returning();

  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "created",
    entity: "energy_accounts",
    entityId: row.id,
    fieldChanged: null,
    oldValue: null,
    newValue: `${row.supplier} / ${row.propertyCode}`,
  });

  res.status(201).json(row);
});

// ─── PATCH /api/energy/:id ────────────────────────────────────────────────────

router.patch("/:id", requireContributor, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const parsed = upsertSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const [existing] = await db
    .select()
    .from(energyAccounts)
    .where(eq(energyAccounts.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });

  const [updated] = await db
    .update(energyAccounts)
    .set({ ...parsed.data, updatedAt: sql`now()` })
    .where(eq(energyAccounts.id, id))
    .returning();

  const fields = Object.keys(parsed.data) as Array<keyof typeof parsed.data>;
  await logFieldChanges(
    {
      userId: req.user!.id,
      userName: req.user!.username,
      entity: "energy_accounts",
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

// ─── DELETE /api/energy/:id ───────────────────────────────────────────────────

router.delete("/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [existing] = await db
    .select()
    .from(energyAccounts)
    .where(eq(energyAccounts.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });

  await db.delete(energyAccounts).where(eq(energyAccounts.id, id));

  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "deleted",
    entity: "energy_accounts",
    entityId: id,
    fieldChanged: null,
    oldValue: `${existing.supplier} / ${existing.propertyCode}`,
    newValue: null,
  });

  res.json({ deleted: true });
});

export default router;
