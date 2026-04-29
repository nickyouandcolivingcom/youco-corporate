import { Router } from "express";
import { eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { waterAccounts, ENERGY_STATUSES } from "@shared/schema";
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
  supplyAddress: z.string().nullable().optional(),
  rateableValue: numStr,
  billingFrequency: z.string().default("Annual"),
  status: z.enum(ENERGY_STATUSES).default("Active"),
  notes: z.string().nullable().optional(),
});

router.get("/", requireAuth, async (req, res) => {
  const search = (req.query.search as string | undefined)?.trim() ?? "";
  const rows = search
    ? await db
        .select()
        .from(waterAccounts)
        .where(
          or(
            ilike(waterAccounts.supplier, `%${search}%`),
            ilike(waterAccounts.propertyCode, `%${search}%`),
            ilike(waterAccounts.accountNumber, `%${search}%`)
          )
        )
        .orderBy(waterAccounts.supplier, waterAccounts.propertyCode)
    : await db
        .select()
        .from(waterAccounts)
        .orderBy(waterAccounts.supplier, waterAccounts.propertyCode);
  res.json(rows);
});

router.post("/", requireContributor, async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const [row] = await db
    .insert(waterAccounts)
    .values({ ...parsed.data, updatedAt: sql`now()` })
    .returning();
  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "created",
    entity: "water_accounts",
    entityId: row.id,
    fieldChanged: null,
    oldValue: null,
    newValue: `${row.supplier} / ${row.propertyCode}`,
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
  const [existing] = await db.select().from(waterAccounts).where(eq(waterAccounts.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });
  const [updated] = await db
    .update(waterAccounts)
    .set({ ...parsed.data, updatedAt: sql`now()` })
    .where(eq(waterAccounts.id, id))
    .returning();
  await logFieldChanges(
    {
      userId: req.user!.id,
      userName: req.user!.username,
      entity: "water_accounts",
      entityId: id,
    },
    Object.keys(parsed.data).map((f) => ({
      field: f,
      oldValue: (existing as never)[f] ?? null,
      newValue: (parsed.data as never)[f] ?? null,
    }))
  );
  res.json(updated);
});

router.delete("/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [existing] = await db.select().from(waterAccounts).where(eq(waterAccounts.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });
  await db.delete(waterAccounts).where(eq(waterAccounts.id, id));
  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "deleted",
    entity: "water_accounts",
    entityId: id,
    fieldChanged: null,
    oldValue: `${existing.supplier} / ${existing.propertyCode}`,
    newValue: null,
  });
  res.json({ deleted: true });
});

export default router;
