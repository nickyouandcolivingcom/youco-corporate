import { Router } from "express";
import { eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import pdfParseLib from "pdf-parse";
import { db } from "../db.js";
import { mortgages } from "@shared/schema";
import { PROPERTY_CODE_VALUES } from "@shared/property-codes";
import { requireAuth, requireContributor, requireAdmin } from "../middleware/auth.js";
import { logAudit, logFieldChanges } from "../audit.js";
import { parseKrbsOffer } from "../parsers/krbs.js";
import { parseLendInvestOffer } from "../parsers/lendinvest.js";
import { parsePreciseOffer } from "../parsers/precise.js";
import { parseLandbayOffer } from "../parsers/landbay.js";
import type { MortgageRow } from "../parsers/mortgage-types.js";

const router = Router();

const numStr = z
  .union([z.string(), z.number()])
  .nullable()
  .optional()
  .transform((v) => (v === null || v === undefined || v === "" ? null : String(v)));

const upsertSchema = z.object({
  lender: z.string().min(1),
  propertyCode: z.enum(PROPERTY_CODE_VALUES as [string, ...string[]]),
  borrowerEntity: z.enum(["YCO", "MONOCROM"]).default("YCO"),
  accountNumber: z.string().nullable().optional(),
  lenderReference: z.string().nullable().optional(),
  offerDate: z.string().nullable().optional(),
  completionDate: z.string().nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  loanAmount: numStr,
  valuation: numStr,
  termMonths: z.number().int().nullable().optional(),
  repaymentType: z.string().nullable().optional(),
  fixedRatePct: numStr,
  fixedPeriodMonths: z.number().int().nullable().optional(),
  fixedEndDate: z.string().nullable().optional(),
  reversionaryMarginPct: numStr,
  reversionaryFloorPct: numStr,
  monthlyPaymentFixed: numStr,
  status: z.enum(["Active", "Redeemed", "Pending"]).default("Active"),
  notes: z.string().nullable().optional(),
});

router.get("/", requireAuth, async (req, res) => {
  const search = (req.query.search as string | undefined)?.trim() ?? "";
  const rows = search
    ? await db
        .select()
        .from(mortgages)
        .where(
          or(
            ilike(mortgages.lender, `%${search}%`),
            ilike(mortgages.propertyCode, `%${search}%`),
            ilike(mortgages.accountNumber, `%${search}%`)
          )
        )
        .orderBy(mortgages.propertyCode)
    : await db.select().from(mortgages).orderBy(mortgages.propertyCode);
  res.json(rows);
});

router.post("/", requireContributor, async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const [row] = await db
    .insert(mortgages)
    .values({ ...parsed.data, updatedAt: sql`now()` })
    .returning();
  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "created",
    entity: "mortgages",
    entityId: row.id,
    fieldChanged: null,
    oldValue: null,
    newValue: `${row.lender} / ${row.propertyCode}`,
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
  const [existing] = await db.select().from(mortgages).where(eq(mortgages.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });
  const [updated] = await db
    .update(mortgages)
    .set({ ...parsed.data, updatedAt: sql`now()` })
    .where(eq(mortgages.id, id))
    .returning();
  await logFieldChanges(
    {
      userId: req.user!.id,
      userName: req.user!.username,
      entity: "mortgages",
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
  const [existing] = await db.select().from(mortgages).where(eq(mortgages.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });
  await db.delete(mortgages).where(eq(mortgages.id, id));
  await logAudit({
    userId: req.user!.id,
    userName: req.user!.username,
    action: "deleted",
    entity: "mortgages",
    entityId: id,
    fieldChanged: null,
    oldValue: `${existing.lender} / ${existing.propertyCode}`,
    newValue: null,
  });
  res.json({ deleted: true });
});

// ─── PDF bulk import ──────────────────────────────────────────────────────────

interface ParserDef {
  lender: string;
  detect: (text: string, filename: string) => boolean;
  parse: (text: string, fallbackPropertyCode?: string) => {
    ok: boolean;
    row?: MortgageRow;
    error?: string;
  };
}

const PARSERS: ParserDef[] = [
  {
    lender: "Kent Reliance",
    detect: (t, f) => /KRBS/i.test(f) || /Kent Reliance/i.test(t) || /Choices Mortgage/i.test(t),
    parse: parseKrbsOffer,
  },
  {
    lender: "Precise",
    detect: (t, f) => /PRECISE/i.test(f) || /Precise Mortgages/i.test(t),
    parse: parsePreciseOffer,
  },
  {
    lender: "LendInvest",
    detect: (t, f) => /LENDINVEST/i.test(f) || /LendInvest/i.test(t),
    parse: parseLendInvestOffer,
  },
  {
    lender: "Landbay",
    detect: (t, f) => /LANDBAY/i.test(f) || /Landbay Partners/i.test(t),
    parse: parseLandbayOffer,
  },
];

// Try to extract a property code from a filename like "13.406 MORTGAGE OFFER 16RC KRBS.pdf"
function propertyFromFilename(name: string): string | undefined {
  const upper = name.toUpperCase();
  for (const code of PROPERTY_CODE_VALUES) {
    // Match the code as a whole word (avoiding e.g. "16RC" matching inside "16RCK")
    const re = new RegExp(`\\b${code}\\b`);
    if (re.test(upper)) return code;
  }
  return undefined;
}

router.post("/import-pdfs", requireContributor, async (req, res) => {
  const schema = z.object({
    files: z.array(z.object({ name: z.string(), base64: z.string() })).min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const results: Array<{
    file: string;
    lender?: string;
    propertyCode?: string;
    status: "ok" | "error" | "no_parser";
    row?: MortgageRow;
    error?: string;
  }> = [];

  for (const f of parsed.data.files) {
    try {
      const buf = Buffer.from(f.base64, "base64");
      const text = (await pdfParseLib(buf)).text;
      const matched = PARSERS.find((p) => p.detect(text, f.name));
      if (!matched) {
        results.push({
          file: f.name,
          status: "no_parser",
          error: "No mortgage parser matched this PDF",
        });
        continue;
      }
      const fallback = propertyFromFilename(f.name);
      const out = matched.parse(text, fallback);
      if (!out.ok) {
        results.push({
          file: f.name,
          lender: matched.lender,
          status: "error",
          error: out.error,
        });
        continue;
      }
      results.push({
        file: f.name,
        lender: matched.lender,
        propertyCode: out.row?.propertyCode,
        status: "ok",
        row: out.row,
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
    results,
    rows: okRows,
  });
});

// Bulk insert from an array of mortgage rows. Used by the UI after the user
// reviews PDF parse results. Dedupes by (lender, property_code, account_number).
router.post("/bulk-insert", requireContributor, async (req, res) => {
  const schema = z.object({ rows: z.array(upsertSchema) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const incoming = parsed.data.rows;

  const existing = await db.select().from(mortgages);
  const keyOf = (r: { lender: string; propertyCode: string; accountNumber?: string | null }) =>
    `${r.lender}|${r.propertyCode}|${r.accountNumber ?? ""}`;
  const existingKeys = new Set(existing.map((e) => keyOf(e)));

  const toInsert: typeof incoming = [];
  const duplicates: number[] = [];
  incoming.forEach((r, i) => {
    if (existingKeys.has(keyOf(r))) duplicates.push(i + 1);
    else {
      existingKeys.add(keyOf(r));
      toInsert.push(r);
    }
  });

  if (toInsert.length > 0) {
    await db.insert(mortgages).values(
      toInsert.map((r) => ({
        ...r,
        updatedAt: sql`now()`,
      }))
    );
  }

  res.json({
    received: incoming.length,
    inserted: toInsert.length,
    skippedDuplicates: duplicates.length,
  });
});

export default router;
