import { Router } from "express";
import { eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { portfolioProperties } from "@shared/schema";
import { requireAuth, requireContributor, requireAdmin } from "../middleware/auth.js";
import { logAudit, logFieldChanges } from "../audit.js";

const router = Router();

const moneyStr = z
  .union([z.string(), z.number()])
  .nullable()
  .optional()
  .transform((v) => (v === null || v === undefined || v === "" ? null : String(v)));

const upsertSchema = z.object({
  address: z.string().min(1),
  postcode: z.string().nullable().optional(),
  ownershipEntity: z.enum(["YCO", "MONOCROM"]).default("YCO"),
  beneficialSharePct: moneyStr,
  purchaseDate: z.string().nullable().optional(),
  purchasePrice: moneyStr,
  capitalCosts: moneyStr,
  currentValueRics: moneyStr,
  ricsDate: z.string().nullable().optional(),
  currentValueLatent: moneyStr,
  grossAnnualRent: moneyStr,
  lettingUnits: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// ─── GET /api/portfolio ───────────────────────────────────────────────────────

router.get("/", requireAuth, async (req, res) => {
  const search = (req.query.search as string | undefined)?.trim() ?? "";

  const rows = search
    ? await db
        .select()
        .from(portfolioProperties)
        .where(
          or(
            ilike(portfolioProperties.address, `%${search}%`),
            ilike(portfolioProperties.postcode, `%${search}%`),
            ilike(portfolioProperties.ownershipEntity, `%${search}%`)
          )
        )
        .orderBy(portfolioProperties.address)
    : await db
        .select()
        .from(portfolioProperties)
        .orderBy(portfolioProperties.address);

  res.json(rows);
});

// ─── POST /api/portfolio/csv-import ───────────────────────────────────────────

router.post("/csv-import", requireContributor, async (req, res) => {
  const parsed = z.array(upsertSchema).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const rows = parsed.data.map((r) => ({
    address: r.address,
    postcode: r.postcode ?? null,
    ownershipEntity: r.ownershipEntity ?? "YCO",
    beneficialSharePct: r.beneficialSharePct ?? null,
    purchaseDate: r.purchaseDate ?? null,
    purchasePrice: r.purchasePrice ?? null,
    capitalCosts: r.capitalCosts ?? null,
    currentValueRics: r.currentValueRics ?? null,
    ricsDate: r.ricsDate ?? null,
    currentValueLatent: r.currentValueLatent ?? null,
    grossAnnualRent: r.grossAnnualRent ?? null,
    lettingUnits: r.lettingUnits ?? null,
    notes: r.notes ?? null,
    updatedAt: sql`now()`,
  }));

  if (rows.length === 0) return res.json({ inserted: 0 });

  await db.insert(portfolioProperties).values(rows);

  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "created",
    entity: "portfolio_properties",
    entityId: null,
    fieldChanged: null,
    oldValue: null,
    newValue: `CSV import: ${rows.length} rows`,
  });

  res.json({ inserted: rows.length });
});

// ─── POST /api/portfolio ──────────────────────────────────────────────────────

router.post("/", requireContributor, async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const [row] = await db
    .insert(portfolioProperties)
    .values({ ...parsed.data, updatedAt: sql`now()` })
    .returning();

  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "created",
    entity: "portfolio_properties",
    entityId: row.id,
    fieldChanged: null,
    oldValue: null,
    newValue: row.address,
  });

  res.status(201).json(row);
});

// ─── PATCH /api/portfolio/:id ─────────────────────────────────────────────────

router.patch("/:id", requireContributor, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const parsed = upsertSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const [existing] = await db
    .select()
    .from(portfolioProperties)
    .where(eq(portfolioProperties.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });

  const [updated] = await db
    .update(portfolioProperties)
    .set({ ...parsed.data, updatedAt: sql`now()` })
    .where(eq(portfolioProperties.id, id))
    .returning();

  const fields = Object.keys(parsed.data) as Array<keyof typeof parsed.data>;
  await logFieldChanges(
    {
      userId: req.user!.id,
      userName: req.user!.username,
      entity: "portfolio_properties",
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

// ─── DELETE /api/portfolio/:id ────────────────────────────────────────────────

router.delete("/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [existing] = await db
    .select()
    .from(portfolioProperties)
    .where(eq(portfolioProperties.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });

  await db.delete(portfolioProperties).where(eq(portfolioProperties.id, id));

  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "deleted",
    entity: "portfolio_properties",
    entityId: id,
    fieldChanged: null,
    oldValue: existing.address,
    newValue: null,
  });

  res.json({ deleted: true });
});

export default router;
