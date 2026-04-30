import { Router } from "express";
import { eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db.js";
import { broadbandAccounts, ENERGY_STATUSES } from "@shared/schema";
import { PROPERTY_CODE_VALUES } from "@shared/property-codes";
import { requireAuth, requireContributor, requireAdmin } from "../middleware/auth.js";
import { logAudit, logFieldChanges } from "../audit.js";

const router = Router();

const numStr = z
  .union([z.string(), z.number()])
  .nullable()
  .optional()
  .transform((v) => (v === null || v === undefined || v === "" ? null : String(v)));

const intOpt = z
  .union([z.number(), z.string()])
  .nullable()
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : parseInt(v, 10);
    return isNaN(n) ? null : n;
  });

const upsertSchema = z.object({
  supplier: z.string().min(1),
  propertyCode: z.enum(PROPERTY_CODE_VALUES as [string, ...string[]]),
  accountNumber: z.string().nullable().optional(),
  loginEmail: z.string().nullable().optional(),
  connectionType: z.string().nullable().optional(),
  downloadMbps: intOpt,
  uploadMbps: intOpt,
  contractStart: z.string().nullable().optional(),
  contractEnd: z.string().nullable().optional(),
  monthlyCost: numStr,
  nextPriceIncreaseDate: z.string().nullable().optional(),
  nextPriceIncreaseAmount: numStr,
  latestInvoiceDate: z.string().nullable().optional(),
  latestInvoiceAmount: numStr,
  tenantPaid: z.boolean().default(false),
  status: z.enum(ENERGY_STATUSES).default("Active"),
  notes: z.string().nullable().optional(),
});

router.get("/", requireAuth, async (req, res) => {
  const search = (req.query.search as string | undefined)?.trim() ?? "";
  const rows = search
    ? await db
        .select()
        .from(broadbandAccounts)
        .where(
          or(
            ilike(broadbandAccounts.supplier, `%${search}%`),
            ilike(broadbandAccounts.propertyCode, `%${search}%`),
            ilike(broadbandAccounts.accountNumber, `%${search}%`)
          )
        )
        .orderBy(broadbandAccounts.propertyCode)
    : await db.select().from(broadbandAccounts).orderBy(broadbandAccounts.propertyCode);
  res.json(rows);
});

router.post("/", requireContributor, async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const [row] = await db
    .insert(broadbandAccounts)
    .values({ ...parsed.data, updatedAt: sql`now()` })
    .returning();
  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "created",
    entity: "broadband_accounts",
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
  const [existing] = await db
    .select()
    .from(broadbandAccounts)
    .where(eq(broadbandAccounts.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });
  const [updated] = await db
    .update(broadbandAccounts)
    .set({ ...parsed.data, updatedAt: sql`now()` })
    .where(eq(broadbandAccounts.id, id))
    .returning();
  await logFieldChanges(
    {
      userId: req.user!.id,
      userName: req.user!.username,
      entity: "broadband_accounts",
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
  const [existing] = await db
    .select()
    .from(broadbandAccounts)
    .where(eq(broadbandAccounts.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });
  await db.delete(broadbandAccounts).where(eq(broadbandAccounts.id, id));
  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "deleted",
    entity: "broadband_accounts",
    entityId: id,
    fieldChanged: null,
    oldValue: `${existing.supplier} / ${existing.propertyCode}`,
    newValue: null,
  });
  res.json({ deleted: true });
});

// Seed initial 10 accounts based on Nick's configuration. Idempotent — only
// inserts if the (supplier, property_code) pair doesn't already exist.
router.post("/seed", requireAdmin, async (_req, res) => {
  const seeds: Array<{
    supplier: string;
    propertyCode: string;
    accountNumber?: string;
    tenantPaid?: boolean;
  }> = [
    { supplier: "Landlord Broadband", propertyCode: "16RC", accountNumber: "LALAS004916" },
    { supplier: "Landlord Broadband", propertyCode: "10KG", accountNumber: "LALAS004916" },
    { supplier: "Landlord Broadband", propertyCode: "32LFR", accountNumber: "LALAS004916" },
    { supplier: "Landlord Broadband", propertyCode: "84DD", accountNumber: "LALAS004916" },
    { supplier: "Landlord Broadband", propertyCode: "4WS", accountNumber: "LALAS004916" },
    { supplier: "BT", propertyCode: "26BLA", accountNumber: "GB28908687" },
    { supplier: "Virgin Media", propertyCode: "26BLB", accountNumber: "755376201" },
    { supplier: "BT", propertyCode: "26BLC", accountNumber: "GB28785491" },
    { supplier: "Virgin Media", propertyCode: "27BLA", accountNumber: "755468201" },
    { supplier: "Virgin Media", propertyCode: "27BLB", accountNumber: "766651801" },
    { supplier: "Sky", propertyCode: "27BLD", accountNumber: "00625133427348" },
  ];

  const existing = await db.select().from(broadbandAccounts);
  const key = (s: string, p: string) => `${s}|${p}`;
  const have = new Set(existing.map((e) => key(e.supplier, e.propertyCode)));

  let inserted = 0;
  for (const s of seeds) {
    if (have.has(key(s.supplier, s.propertyCode))) continue;
    await db.insert(broadbandAccounts).values({
      supplier: s.supplier,
      propertyCode: s.propertyCode,
      accountNumber: s.accountNumber ?? null,
      tenantPaid: s.tenantPaid ?? false,
      status: "Active",
      updatedAt: sql`now()`,
    });
    inserted++;
  }
  res.json({ seeds: seeds.length, inserted, skipped: seeds.length - inserted });
});

export default router;
