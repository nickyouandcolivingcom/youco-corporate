import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { docs } from "@shared/schema";
import { requireAuth, requireContributor, requireAdmin } from "../middleware/auth.js";
import { logAudit } from "../audit.js";

const router = Router();

const upsertSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase, hyphens only"),
  title: z.string().min(1),
  category: z.string().min(1).default("General"),
  sortOrder: z.number().int().default(100),
  body: z.string().default(""),
});

router.get("/", requireAuth, async (_req, res) => {
  const rows = await db
    .select()
    .from(docs)
    .orderBy(docs.category, docs.sortOrder, docs.title);
  res.json(rows);
});

router.get("/:slug", requireAuth, async (req, res) => {
  const slug = req.params.slug as string;
  const [row] = await db.select().from(docs).where(eq(docs.slug, slug));
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

router.post("/", requireContributor, async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const [row] = await db
    .insert(docs)
    .values({ ...parsed.data, updatedBy: req.user!.username, updatedAt: sql`now()` })
    .returning();
  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "created",
    entity: "docs",
    entityId: row.id,
    fieldChanged: null,
    oldValue: null,
    newValue: row.title,
  });
  res.status(201).json(row);
});

router.patch("/:slug", requireContributor, async (req, res) => {
  const slug = req.params.slug as string;
  const parsed = upsertSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const [existing] = await db.select().from(docs).where(eq(docs.slug, slug));
  if (!existing) return res.status(404).json({ error: "Not found" });
  const [updated] = await db
    .update(docs)
    .set({ ...parsed.data, updatedBy: req.user!.username, updatedAt: sql`now()` })
    .where(eq(docs.slug, slug))
    .returning();
  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "updated",
    entity: "docs",
    entityId: existing.id,
    fieldChanged: "body",
    oldValue: null,
    newValue: null,
  });
  res.json(updated);
});

router.delete("/:slug", requireAdmin, async (req, res) => {
  const slug = req.params.slug as string;
  const [existing] = await db.select().from(docs).where(eq(docs.slug, slug));
  if (!existing) return res.status(404).json({ error: "Not found" });
  await db.delete(docs).where(eq(docs.slug, slug));
  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "deleted",
    entity: "docs",
    entityId: existing.id,
    fieldChanged: null,
    oldValue: existing.title,
    newValue: null,
  });
  res.json({ deleted: true });
});

export default router;
