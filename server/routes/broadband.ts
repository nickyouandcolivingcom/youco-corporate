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

// Seed the 11 known circuits with all data extracted from contracts/bills.
// Behaviour: INSERTS if missing, REFRESHES only currently-null fields if exists
// (so user edits are preserved while gaps get filled). Login email is shared.
type Seed = {
  supplier: string;
  propertyCode: string;
  accountNumber?: string;
  loginEmail?: string;
  connectionType?: string;
  downloadMbps?: number;
  uploadMbps?: number;
  contractStart?: string;
  contractEnd?: string;
  monthlyCost?: string;
  nextPriceIncreaseDate?: string;
  nextPriceIncreaseAmount?: string;
  latestInvoiceDate?: string;
  latestInvoiceAmount?: string;
  tenantPaid?: boolean;
  notes?: string;
};

router.post("/seed", requireAdmin, async (_req, res) => {
  const EMAIL = "nick@youandcoliving.com";
  const seeds: Seed[] = [
    // Landlord Broadband — single account, 5 properties, no contract data captured
    { supplier: "Landlord Broadband", propertyCode: "16RC", accountNumber: "LALAS004916" },
    { supplier: "Landlord Broadband", propertyCode: "10KG", accountNumber: "LALAS004916" },
    { supplier: "Landlord Broadband", propertyCode: "32LFR", accountNumber: "LALAS004916" },
    { supplier: "Landlord Broadband", propertyCode: "84DD", accountNumber: "LALAS004916" },
    { supplier: "Landlord Broadband", propertyCode: "4WS", accountNumber: "LALAS004916" },

    // BT 26BLA — Fibre 2 with Complete Wi-Fi (FTTC). £30.71 reg less £5 promo = £25.71.
    {
      supplier: "BT",
      propertyCode: "26BLA",
      accountNumber: "GB28908687",
      loginEmail: EMAIL,
      connectionType: "FTTC (Fibre to Cabinet)",
      downloadMbps: 74,
      uploadMbps: 18,
      monthlyCost: "25.71",
      latestInvoiceDate: "2026-04-24",
      latestInvoiceAmount: "25.71",
      notes: "BT Fibre 2 with Complete Wi-Fi. £5/mo special offer discount; contract end date not in latest bill — check original BT order email.",
    },

    // BT 26BLC — Fibre 1 (FTTC). Just had price hike 31 Mar 2026 (£37.86 → £41.86).
    {
      supplier: "BT",
      propertyCode: "26BLC",
      accountNumber: "GB28785491",
      loginEmail: EMAIL,
      connectionType: "FTTC (Fibre to Cabinet)",
      downloadMbps: 51,
      uploadMbps: 9,
      monthlyCost: "36.86",
      latestInvoiceDate: "2026-04-24",
      latestInvoiceAmount: "39.96",
      notes: "BT Fibre 1. £5/mo special offer discount; price already increased 31 Mar 2026 from £37.86 to £41.86 (regular). Contract end date not in latest bill.",
    },

    // Virgin 26BLB — M500 + Netflix Standard with Ads. 24-month contract.
    {
      supplier: "Virgin Media",
      propertyCode: "26BLB",
      accountNumber: "755376201",
      loginEmail: EMAIL,
      connectionType: "FTTP (Full Fibre)",
      downloadMbps: 548,
      uploadMbps: 53,
      contractStart: "2025-11-27",
      contractEnd: "2027-11-26",
      monthlyCost: "47.00",
      nextPriceIncreaseDate: "2027-04-01",
      nextPriceIncreaseAmount: "4.00",
      latestInvoiceDate: "2026-04-02",
      latestInvoiceAmount: "47.00",
      notes: "Virgin M500 + Netflix Std w/Ads. Escalator: £43→£47 Apr 2026 (done) → £51 Apr 2027 → £80 from 27 Nov 2027 (promo end).",
    },

    // Virgin 27BLA — M350. Welcome offer 18-month savings ends 28 Nov 2026.
    {
      supplier: "Virgin Media",
      propertyCode: "27BLA",
      accountNumber: "755468201",
      loginEmail: EMAIL,
      connectionType: "FTTP (Full Fibre)",
      monthlyCost: "33.49",
      contractEnd: "2026-11-28",
      nextPriceIncreaseDate: "2026-11-28",
      nextPriceIncreaseAmount: "36.01",
      latestInvoiceDate: "2026-04-21",
      latestInvoiceAmount: "33.49",
      notes: "Virgin M350. Welcome-offer discount £36.01/mo ends 28 Nov 2026 — bill jumps to £69.50/mo unless recontracted.",
    },

    // Virgin 27BLB — M500. 18-month contract — IMMINENT cliff 13 May 2026.
    {
      supplier: "Virgin Media",
      propertyCode: "27BLB",
      accountNumber: "766651801",
      loginEmail: EMAIL,
      connectionType: "FTTP (Full Fibre)",
      downloadMbps: 548,
      uploadMbps: 52,
      contractStart: "2024-11-13",
      contractEnd: "2026-05-12",
      monthlyCost: "41.65",
      nextPriceIncreaseDate: "2026-05-13",
      nextPriceIncreaseAmount: "30.35",
      latestInvoiceDate: "2026-04-02",
      latestInvoiceAmount: "41.65",
      notes: "Virgin M500. Welcome-offer 18-month discount ends 12 May 2026 — bill jumps from £41.65 to £72.00/mo from 13 May. RECONTRACT URGENTLY.",
    },

    // Sky 27BLD — Broadband Superfast (FTTC) + Talk Internet Calls.
    {
      supplier: "Sky",
      propertyCode: "27BLD",
      accountNumber: "00625133427348",
      loginEmail: EMAIL,
      connectionType: "FTTC (Fibre to Cabinet)",
      downloadMbps: 61,
      uploadMbps: 16,
      monthlyCost: "30.00",
      contractEnd: "2027-05-21",
      nextPriceIncreaseDate: "2027-05-22",
      nextPriceIncreaseAmount: "19.00",
      latestInvoiceDate: "2026-04-07",
      latestInvoiceAmount: "30.00",
      notes: "Sky Broadband Superfast + Sky Talk Internet Calls. £49 list less £19 in-contract+broadband discounts; both discounts end 21 May 2027.",
    },
  ];

  const existing = await db.select().from(broadbandAccounts);
  const byKey = new Map(existing.map((e) => [`${e.supplier}|${e.propertyCode}`, e]));

  let inserted = 0;
  let refreshed = 0;
  let unchanged = 0;
  for (const s of seeds) {
    const key = `${s.supplier}|${s.propertyCode}`;
    const row = byKey.get(key);
    const values = {
      supplier: s.supplier,
      propertyCode: s.propertyCode,
      accountNumber: s.accountNumber ?? null,
      loginEmail: s.loginEmail ?? null,
      connectionType: s.connectionType ?? null,
      downloadMbps: s.downloadMbps ?? null,
      uploadMbps: s.uploadMbps ?? null,
      contractStart: s.contractStart ?? null,
      contractEnd: s.contractEnd ?? null,
      monthlyCost: s.monthlyCost ?? null,
      nextPriceIncreaseDate: s.nextPriceIncreaseDate ?? null,
      nextPriceIncreaseAmount: s.nextPriceIncreaseAmount ?? null,
      latestInvoiceDate: s.latestInvoiceDate ?? null,
      latestInvoiceAmount: s.latestInvoiceAmount ?? null,
      tenantPaid: s.tenantPaid ?? false,
      notes: s.notes ?? null,
    };

    if (!row) {
      await db.insert(broadbandAccounts).values({
        ...values,
        status: "Active",
        updatedAt: sql`now()`,
      });
      inserted++;
      continue;
    }

    // Refresh: only set fields the user hasn't already populated.
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) {
      if (v === null || v === false) continue;
      const cur = (row as Record<string, unknown>)[k];
      if (cur === null || cur === "" || cur === undefined) patch[k] = v;
    }
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = sql`now()`;
      await db.update(broadbandAccounts).set(patch).where(eq(broadbandAccounts.id, row.id));
      refreshed++;
    } else {
      unchanged++;
    }
  }
  res.json({ seeds: seeds.length, inserted, refreshed, unchanged });
});

export default router;
