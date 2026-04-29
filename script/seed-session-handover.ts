/**
 * Inserts / updates a "Session handover" doc in the Operations Manual.
 *
 * Captures current state of the youco-corporate build so a future Claude
 * session can pick up without re-reading the entire chat history. Run
 * after each major phase to refresh.
 *
 * Usage:
 *   DATABASE_URL=<url> tsx script/seed-session-handover.ts
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "../shared/schema.js";

const BODY = `# Session handover — 2026-04-29

What's built so far in youco-corporate, and what comes next. Read this
doc + the Energy maintenance doc before resuming a new chat session.

## What's live

| Module | Routes | Notes |
| --- | --- | --- |
| Portfolio | \`/portfolio\` | 7 freehold properties, wealth-statement fields. Seed: \`npm run db:seed-portfolio\`. |
| Suppliers | \`/suppliers/contacts\` | 81 supplier contacts. Already-built before this session. |
| Energy — Accounts | \`/energy\` | 14 supplies (10 Octopus + 4 EON). Seed: \`db:seed-energy-accounts\`. |
| Energy — Invoices | \`/energy/invoices\` | 138 wide-format aggregates + 366 historical line items + 33+ EON PDFs imported. Bulk Import (CSV / wide / PDF). |
| Energy — Analytics | \`/energy/analytics\` | Recharts line + bar; 1m/3m/6m/12m/2y range chips; fuel toggle. |
| Energy — Sync | \`/energy/sync\` | Octopus discover + sync (8/10 accounts pulling daily kWh). 16RC/10KG via CSV fallback (API returns empty for those two — likely Octopus-side issue). |
| Water — Accounts | \`/water\` | Severn Trent only (Welsh Water historic, ignore). 12 properties = 5 HMOs + 7 leasehold flats. 26BL/27BL freeholds have no water account. |
| Water — Invoices | \`/water/invoices\` | Severn Trent PDF parser handles old (numeric) + new (A-XXX) + metered partial-year formats. Auto-creates water_account row from supply address when account number isn't in DB. 49+ historical PDFs imported. |
| Rules & Docs | \`/docs\` | This page. Editable markdown. |

## What's placeholder

| Module | Notes |
| --- | --- |
| Mortgages | Next to build. See plan below. |
| Broadband | BT mainly. Single supplier so simpler than Energy. Lower priority. |

## Mortgages — plan for next phase

### Properties × Lenders (from wealth statement)

| Property | Lender | Refi date | Account ref (wealth statement) |
| --- | --- | --- | --- |
| 16 Richmond Crescent | Kent Reliance | 31 May 2027 | 70038438 |
| 10 Kensington Green | Kent Reliance | 30 Sep 2027 | 70047385 |
| 32 Lower Field Road | Precise | 3 Dec 2026 | 20109131 |
| 84 Dicksons Drive | Landbay | 20 Sep 2027 | 10187350 |
| 4 Walpole Street | LendInvest | 22 Sep 2026 | 60207413 |
| 26 Brook Lane (MONOCROM) | Landbay | 9 May 2029 | TBD (Landbay case vs account refs differ) |
| 27 Brook Lane | Kent Reliance | 10 Jul 2030 | 809084 |

### Open reconciliation issues (from original handover)

1. **Kent Reliance 27 Brook Lane** — three different references in different documents:
   wealth statement \`809084\`, 2025 KR offer \`4001130500\`, KR mailbag \`71040055\`. Need
   to identify the canonical one before any registered-address-change letter.
2. **Landbay 26BL flats** — wealth statement uses \`10205340/41/42\` (account?) but 2024
   Landbay offer letter uses \`70060243/56/58\` (case?). Confirm which is the
   live ref before quoting.
3. **MONOCROM LIMITED separate entity** — 26 Brook Lane mortgage is on Monocrom's
   books (separate Companies House registration). Registered-office change
   for Monocrom is a separate exercise from You & Co. Living's; don't conflate.

### Schema sketch

\`mortgages\` (one row per active loan):
- supplier (lender), property_code (FK to portfolio), borrower_entity (YCO / MONOCROM)
- account_number, lender_reference, broker_reference
- offer_date, completion_date, term_months, repayment_type (Interest Only / Repayment)
- loan_amount, fees_added_to_loan, total_advance
- fixed_rate_pct, fixed_period_months, fixed_end_date
- reversionary_margin_pct, reversionary_floor_pct, current_rate_pct
- aprc_pct, monthly_payment_fixed, monthly_payment_reversionary_estimate
- valuation_at_offer, refinancing_date (= fixed_end_date)
- status (Active / Redeemed / Pending)

\`mortgage_erc_schedule\` (early-repayment charge tiers — varies by lender):
- mortgage_id (FK), tier_order, period_start, period_end, charge_pct, max_charge_amount

\`mortgage_payments\` (optional — track DD payments if useful for audit):
- mortgage_id (FK), payment_date, amount, type (interest / capital / fee)

### PDF parser pattern

Per-lender parser files: \`server/parsers/lendinvest.ts\`, \`precise.ts\`,
\`kent-reliance.ts\`, \`landbay.ts\`. Each exports a parse function with
the same signature pattern as \`severn-trent.ts\`. Sample PDFs already
shared earlier in the chat (LendInvest 4WS, Precise 32LFR offer letters)
are good starting points; need samples from the other 3 lenders before
their parsers can be built.

## How to seed everything fresh

On Render shell, in order:
\`\`\`
npm run db:seed                       # users (nick, joph)
npm run db:seed-portfolio             # 7 properties
npm run db:seed-energy-accounts       # 14 energy supplies
npm run db:seed-energy-line-items     # 366 historical invoice line-items
npm run db:seed-water-accounts        # 12 placeholder water accounts (most auto-create from PDF imports)
npm run db:seed-docs                  # operations manual + welcome
npm run db:seed-session-handover      # this doc
\`\`\`

## Known limits / things to investigate later

- **Octopus \`/consumption/\` returns empty for 16RC and 10KG** despite HH being
  enabled and the dashboard having data. Workaround: CSV import via
  \`/energy/sync\` Step 3. Worth raising a ticket with Octopus support.
- **26BLA/B/C gas meters** are too far from the SMETS hub (~12-15m, range
  is 8-10m) — manual readings only, captured via Octopus monthly billing.
- **EON has no public consumption API.** Invoice-only forever.
- **Water m³ volume** not yet tracked separately from £ amounts. Easy
  enhancement: extract per-m³ rates and total m³ from metered bill PDFs.
- **Mortgages** — entire module not built.

## File-sync gotcha (for the developer working on the code)

When pushing changes, ALWAYS verify \`package.json\` has every dependency
the code uses BEFORE git push. The build environment runs \`npm install\`
which honors package.json over the lockfile, and any missing entries
cause Vite/Rollup to fail with "could not resolve import" errors. This
has bitten three times so far (recharts, react-markdown, pdf-parse). Run:

\`\`\`
grep -E "<new-package>" package.json
\`\`\`

before committing.

---

*Last updated 2026-04-29 by the build session. Refresh after each major phase.*
`;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  const slug = "session-handover";
  const [existing] = await db
    .select()
    .from(schema.docs)
    .where(eq(schema.docs.slug, slug));

  if (existing) {
    await db
      .update(schema.docs)
      .set({
        title: "Session Handover (2026-04-29)",
        category: "Build",
        sortOrder: 5,
        body: BODY,
        updatedBy: "system seed",
        updatedAt: new Date(),
      })
      .where(eq(schema.docs.id, existing.id));
    console.log("Session handover doc updated");
  } else {
    await db.insert(schema.docs).values({
      slug,
      title: "Session Handover (2026-04-29)",
      category: "Build",
      sortOrder: 5,
      body: BODY,
      updatedBy: "system seed",
    });
    console.log("Session handover doc inserted");
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
