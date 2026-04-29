/**
 * Seeds the initial Operations Manual docs. Idempotent — upserts by slug.
 *
 * Usage:
 *   DATABASE_URL=<url> tsx script/seed-docs.ts
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "../shared/schema.js";

interface DocSeed {
  slug: string;
  title: string;
  category: string;
  sortOrder: number;
  body: string;
}

const ENERGY_BODY = `# Energy — Routine Maintenance

This is the playbook for keeping the Energy module accurate. Run through it
roughly once a month, after EON / Octopus invoices arrive, or after any
supplier change.

## Monthly checklist

### 1. Sync Octopus daily readings (5 min)
Visit \`/energy/sync\`.

- Run **Discovery** only if you've added a new account or changed suppliers
  (otherwise skip — it's idempotent but not free)
- Set date range to **Last 30d** and click **Sync All Octopus Accounts**
- 8 of 10 accounts produce real kWh; **16RC and 10KG return 0 days** (Octopus
  API quirk for those two — fix below)

### 2. Fill 16RC and 10KG with the CSV fallback (10 min)
For each of the four (account × fuel) gaps:

1. Log into \`octopus.energy/dashboard\`
2. Switch to the relevant account (A-1D659703 = 16RC, A-2474F4DC = 10KG)
3. **My energy → "Get your energy geek on"**
4. Choose data: **Electricity** or **Gas**, dates: last month
5. Download the CSV
6. On \`/energy/sync\` → **Step 3 — Import consumption CSV** → pick account +
   fuel → Choose CSV → upload

Repeat 4 times (16RC E, 16RC G, 10KG E, 10KG G).

### 3. Add new EON invoices (5 min)
EON has no public consumption API — invoice-only.

- Single invoice: \`/energy/invoices\` → **Add Invoice** → Property = 27BLA / B
  / D, Supplier = EON, period dates, amount, electricity_kwh
- Several at once: \`/energy/invoices\` → **Bulk Import** → upload long-format
  CSV. Duplicates are rejected, missing months are flagged.

### 4. Sanity check on \`/energy/analytics\`
- 12-month view, Electricity → confirm 10 properties show non-zero kWh
- 1-month view, Electricity → spot any property whose line breaks well above
  its previous range (signal for adverse trend)
- Switch to Gas → confirm the dual-fuel properties (16RC, 10KG, 32LFR, 84DD,
  4WS) are showing

## CSV formats reference

### Bulk invoice import (long format)
Headers (any order, snake_case or camelCase):

\`property_code, supplier, period_start, period_end, amount, electricity_kwh,
gas_kwh, electricity_amount, gas_amount, vat_amount, invoice_number, notes\`

Required: \`property_code\`, \`supplier\`, \`period_start\`, \`period_end\`, \`amount\`.
Dates in \`YYYY-MM-DD\`. Property code from the 16-code list (CORP, 16RC, 10KG …).

### Octopus consumption CSV (per-account fallback)
Use the file Octopus's dashboard gives you directly — no editing needed.
One CSV per (account × fuel).

## Property codes (16)

| Code | Property |
| --- | --- |
| CORP | Corporate / non-property |
| 16RC | 16 Richmond Crescent |
| 10KG | 10 Kensington Green |
| 32LFR | 32 Lower Field Road |
| 84DD | 84 Dicksons Drive |
| 4WS | 4 Walpole Street |
| 26BL | 26 Brook Lane (freehold / communal) |
| 26BLA / 26BLB / 26BLC | 26 Brook Lane flats A/B/C |
| 27BL | 27 Brook Lane (freehold / communal) |
| 27BLA / 27BLB / 27BLC / 27BLD | 27 Brook Lane flats A-D |
| 26-27BL | Brook Lane communal across both blocks |

## Account ↔ supplier ↔ property map

| A-# | Supplier | Property | Notes |
| --- | --- | --- | --- |
| A-1D659703 | Octopus | 16RC | Dual fuel; CSV fallback for sync |
| A-2474F4DC | Octopus | 10KG | Dual fuel; CSV fallback for sync |
| A-FF2EBA4D | Octopus | 32LFR | Dual fuel |
| A-72C1E760 | Octopus | 84DD | Dual fuel |
| A-109F5A6B | Octopus | 4WS | Dual fuel |
| A-D9D78B72 | Octopus | 26BLA | Electricity; gas meter not smart |
| A-29A4B3FE | Octopus | 26BLB | Electricity; gas meter not smart |
| A-16FF9E82 | Octopus | 26BLC | Electricity; gas meter not smart |
| A-90C87D45 | Octopus | 26BL | Electricity (communal stairwell) |
| A-26F63293 | Octopus | 27BL | Electricity (communal stairwell) |
| A-BEBE32A9 | EON | 27BLA | Live July 2025; tariff Next Fixed 12m v53 |
| A-B1661B4C | EON | 27BLB | Live July 2025 |
| A-D17B776F | EON | 27BLC | **Tenant-paid** — visible in our dashboard, no liability |
| A-F8569CBB | EON | 27BLD | Live July 2025 |

## Known limits / things to investigate

- **Octopus \`/consumption/\` returns empty for 16RC and 10KG** despite HH being
  enabled and the dashboard showing data. CSV fallback works around it.
  Worth raising a support ticket with Octopus when there's time.
- **26BLA/B/C gas meters** are too far from the SMETS hub (~12-15m, range is
  8-10m) — manual readings only, captured at invoice level via Octopus billing.
- **EON has no public consumption API.** Invoice-only forever unless EON ships
  one.

## When something goes wrong

- Sync errors → check \`OCTOPUS_API_KEY\` env var on Render is current
- Duplicate key on bulk import → already imported; check the duplicates panel
- Missing months in gap report → either no invoice issued (e.g. supplier
  switched mid-month) or you haven't received it yet — note in this doc

---

*Edit this doc when procedures change. The sidebar entry is at* **RULES &
DOCS → Operations Manual.**
`;

const SEEDS: DocSeed[] = [
  {
    slug: "energy-routine-maintenance",
    title: "Energy — Routine Maintenance",
    category: "Energy",
    sortOrder: 10,
    body: ENERGY_BODY,
  },
  {
    slug: "intro",
    title: "Welcome",
    category: "General",
    sortOrder: 1,
    body: `# Operations Manual

This is the place for routine procedures, checklists, supplier templates, and
anything else worth referring to month-on-month.

Anyone with admin or contributor role can edit any doc — click **Edit** on
the doc page. Markdown is supported (headings, lists, tables, code blocks).

## Current docs
- **Energy → Routine Maintenance** — monthly playbook for the Energy module

## Roadmap
- Mortgages — refinancing schedule + per-property loan facts (when the Mortgages module is built)
- Suppliers — correspondence templates (Variant A / B / C from the address-change project)
- Compliance — EICR / gas certificate calendar
`,
  },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  let inserted = 0;
  let updated = 0;

  for (const s of SEEDS) {
    const [existing] = await db.select().from(schema.docs).where(eq(schema.docs.slug, s.slug));
    if (existing) {
      await db
        .update(schema.docs)
        .set({ ...s, updatedBy: "system seed", updatedAt: new Date() })
        .where(eq(schema.docs.id, existing.id));
      updated += 1;
    } else {
      await db.insert(schema.docs).values({ ...s, updatedBy: "system seed" });
      inserted += 1;
    }
  }

  console.log(`Docs seed complete: ${inserted} inserted, ${updated} updated`);
  await pool.end();
}

main().catch((err) => {
  console.error("Docs seed failed:", err);
  process.exit(1);
});
