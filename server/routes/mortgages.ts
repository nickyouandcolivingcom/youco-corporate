import { Router } from "express";
import { eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import pdfParseLib from "pdf-parse";
import { db } from "../db.js";
import { mortgages, portfolioProperties } from "@shared/schema";
import { PROPERTY_CODE_VALUES } from "@shared/property-codes";

// Seed addresses chosen so each round-trips through matchAddressToPropertyCode.
// PROPERTY_CODE_LABEL strings ("26BLA — 26 Brook Lane Flat A") don't match the
// "FLATA26BROOKLANE" or "26ABROOKLANE" patterns because of the leading code.
const SEED_ADDRESS_FOR_CODE: Record<string, string> = {
  CORP: "Corporate",
  "16RC": "16 Richmond Crescent",
  "10KG": "10 Kensington Green",
  "32LFR": "32 Lower Field Road",
  "84DD": "84 Dicksons Drive",
  "4WS": "4 Walpole Street",
  "26BL": "26 Brook Lane",
  "26BLA": "Flat A 26 Brook Lane",
  "26BLB": "Flat B 26 Brook Lane",
  "26BLC": "Flat C 26 Brook Lane",
  "27BL": "27 Brook Lane",
  "27BLA": "Flat A 27 Brook Lane",
  "27BLB": "Flat B 27 Brook Lane",
  "27BLC": "Flat C 27 Brook Lane",
  "27BLD": "Flat D 27 Brook Lane",
  "26-27BL": "Brook Lane communal",
};
import { matchAddressToPropertyCode } from "../parsers/address-match.js";
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

  // ── Property-register fields (live on portfolio_properties) ─────────────
  // Folded into the mortgage edit so one Save updates both tables. The
  // server upserts the portfolio row keyed off propertyCode, creating one
  // if it doesn't exist (using PROPERTY_CODE_LABEL[code] as the seed
  // address so matchAddressToPropertyCode round-trips correctly).
  address: z.string().nullable().optional(),
  postcode: z.string().nullable().optional(),
  lettingUnits: z.string().nullable().optional(),
  purchaseDate: z.string().nullable().optional(),
  purchasePrice: numStr,
  capitalCosts: numStr,
  currentValueRics: numStr,
  ricsDate: z.string().nullable().optional(),
  currentValueLatent: numStr,
  grossAnnualRent: numStr,
});

// Splits a parsed body into the mortgage half and the property-register
// half. Used by POST + PATCH so they share the same upsert logic.
function splitProperty<T extends Record<string, unknown>>(data: T) {
  const propertyKeys = [
    "address",
    "postcode",
    "lettingUnits",
    "purchaseDate",
    "purchasePrice",
    "capitalCosts",
    "currentValueRics",
    "ricsDate",
    "currentValueLatent",
    "grossAnnualRent",
  ] as const;
  const property: Record<string, unknown> = {};
  const mortgage: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if ((propertyKeys as readonly string[]).includes(k)) property[k] = v;
    else mortgage[k] = v;
  }
  return { mortgage, property };
}

// Find existing portfolio_properties row for a property code, or null if
// none yet exists. Same matcher logic as the GET enrichment.
async function findPortfolioRowForCode(code: string) {
  const all = await db.select().from(portfolioProperties);
  for (const p of all) {
    if (matchAddressToPropertyCode(p.address) === code) return p;
  }
  return null;
}

// Upserts portfolio_properties for the given property code. Patch object
// only contains keys the caller set — undefined values are skipped, so
// the form's "didn't touch this field" semantics are preserved.
async function upsertPortfolioForCode(
  code: string,
  patch: Record<string, unknown>
) {
  // Drop undefined keys (form fields the user didn't touch). Empty strings
  // and explicit nulls are kept so the user can clear a value.
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    clean[k] = v;
  }
  if (Object.keys(clean).length === 0) return;

  const existing = await findPortfolioRowForCode(code);
  if (existing) {
    // Never let the user blank out the address — it's the join key. If the
    // form sent address: null (blank field, existing row), drop it from the
    // patch so the existing address is preserved.
    if (clean.address === null || clean.address === "") delete clean.address;
    await db
      .update(portfolioProperties)
      .set({ ...clean, updatedAt: sql`now()` })
      .where(eq(portfolioProperties.id, existing.id));
    return;
  }

  // No row yet — insert. Address from the form wins; otherwise use a seed
  // that the matcher can round-trip back to this code.
  const formAddress =
    typeof clean.address === "string" && clean.address.trim() !== ""
      ? (clean.address as string)
      : undefined;
  const seedAddress = formAddress ?? SEED_ADDRESS_FOR_CODE[code] ?? code;
  // Remove address from clean so the explicit `address: seedAddress` below
  // isn't overwritten by the spread.
  delete clean.address;
  await db.insert(portfolioProperties).values({
    address: seedAddress,
    ...clean,
    updatedAt: sql`now()`,
  });
}

// Enriches each mortgage with property-level valuation data via JOIN on
// property_code. Leasehold flats (26BLA/B/C, 27BLA-D) currently have no
// portfolio_properties row, so they show "—" for RICS/Latent/RICS Date until
// they're added. Sums on the parent freehold (26BL/27BL) wouldn't reflect
// the per-flat value, so no auto-fallback.
router.get("/", requireAuth, async (req, res) => {
  const search = (req.query.search as string | undefined)?.trim() ?? "";

  const baseRows = search
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

  // portfolio_properties has `address` not `property_code`. Derive code from
  // address using the same matcher used elsewhere in the app.
  const portfolioRows = await db.select().from(portfolioProperties);
  const portfolioByCode: Record<string, (typeof portfolioRows)[number]> = {};
  for (const p of portfolioRows) {
    const code = matchAddressToPropertyCode(p.address);
    if (code) portfolioByCode[code] = p;
  }

  const enriched = baseRows.map((m) => {
    const p = portfolioByCode[m.propertyCode] ?? null;
    // RICS fallback: a mortgage offer's `valuation` is always a RICS-backed
    // figure from the lender's surveyor, so if we have no portfolio
    // currentValueRics yet (e.g. leasehold flats 26BLA/B/C not registered),
    // we surface the mortgage valuation as the RICS so summary == detail.
    // Portfolio value takes precedence when set (it's typically newer than
    // the original offer valuation).
    const ricsValue = p?.currentValueRics ?? m.valuation ?? null;
    const ricsDate = p?.ricsDate ?? m.offerDate ?? null;
    return {
      ...m,
      ricsValue,
      latentValue: p?.currentValueLatent ?? null,
      ricsDate,
      // Property register fields — surfaced here so Mortgages page replaces
      // the now-deleted Wealth Statement.
      postcode: p?.postcode ?? null,
      purchaseDate: p?.purchaseDate ?? null,
      purchasePrice: p?.purchasePrice ?? null,
      capitalCosts: p?.capitalCosts ?? null,
      grossAnnualRent: p?.grossAnnualRent ?? null,
      lettingUnits: p?.lettingUnits ?? null,
    };
  });

  res.json(enriched);
});

router.post("/", requireContributor, async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { mortgage, property } = splitProperty(parsed.data);
  const [row] = await db
    .insert(mortgages)
    .values({ ...(mortgage as typeof parsed.data), updatedAt: sql`now()` })
    .returning();
  await upsertPortfolioForCode(row.propertyCode, property);
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
  const { mortgage, property } = splitProperty(parsed.data);
  const [existing] = await db.select().from(mortgages).where(eq(mortgages.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });
  const [updated] = await db
    .update(mortgages)
    .set({ ...mortgage, updatedAt: sql`now()` })
    .where(eq(mortgages.id, id))
    .returning();
  // Use the mortgage's propertyCode (post-update, in case the form changed it).
  await upsertPortfolioForCode(updated.propertyCode, property);
  await logFieldChanges(
    {
      userId: req.user!.id,
      userName: req.user!.username,
      entity: "mortgages",
      entityId: id,
    },
    Object.keys(mortgage).map((f) => ({
      field: f,
      oldValue: (existing as never)[f] ?? null,
      newValue: (mortgage as never)[f] ?? null,
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
