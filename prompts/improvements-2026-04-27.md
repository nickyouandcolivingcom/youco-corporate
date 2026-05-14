# youco-corporate — Improvements Plan (2026-04-27)

**Context:** I just completed migrating supplier data from Replit `14.401 Contact Management` into youco-corporate and hit several issues during import. This prompt fixes the underlying bugs and adds missing features. Reference `INTRANET-MIGRATION-HANDOVER.md` for full project context. Preserve all Render deployment fixes documented in handover section 3.1 (esbuild externals, `import.meta.url` banner, `process.cwd()` in vite config, Express 5 wildcard syntax, etc.).

Work through the sections below in order. Commit after each section so I have a clean history.

---

## Section 1 — Fix migration plumbing (BLOCKER, do first)

**Problem:** On Render production, `npm run db:migrate:prod` printed "Migrations complete" but didn't actually create the `suppliers` table. I had to create it manually via raw SQL. This must not happen again before Section 3 ships.

**Investigate and fix:**

- `script/migrate.ts` — add a `console.log` at the start of each migration as it's applied. Print the filename. Currently it's silent and we can't tell if anything actually ran.
- The build process — verify migrations are copied from `migrations/` (source) to `dist/migrations/` (production). Check `script/build.ts`. The handover doc section 3.1.9 specifically calls out that `migrations/meta/_journal.json` must be tracked in git for drizzle to work in production. Confirm this.
- `migrations/meta/_journal.json` — open it and verify entries exist for `0000_*` AND `0001_suppliers.sql`. If `0001_suppliers.sql` is missing from the journal, drizzle skipped it silently.
- After fixes, write a smoke test in `script/migrate.ts` that asserts the `suppliers` table exists after migrations run. Fail loudly if not.

**Commit:** `fix(migrations): log applied migrations and verify dist output`

---

## Section 2 — Fix `parseCsv` parser bugs

**Problem:** During CSV import, four fields (`accountNumber`, `addressPostcode`, `contactPhone`, `youcoContact`) were silently dropped because `parseCsv` in `client/src/pages/suppliers/Contacts.tsx` doesn't normalise camelCase headers, and naive `.split(",")` breaks on values containing commas (like addresses).

**Fix in `client/src/pages/suppliers/Contacts.tsx`:**

**2a — Header normalisation (around line 167):**

Currently:
```ts
const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
```

Replace with a normaliser that handles camelCase too:
```ts
function normaliseHeader(h: string): string {
  return h.trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")  // accountNumber -> account_Number
    .toLowerCase()
    .replace(/\s+/g, "_");                  // "Account Number" -> account_number
}
const headers = lines[0].split(",").map(normaliseHeader);
```

**2b — Replace naive comma split with proper CSV parser:**

```bash
npm i papaparse
npm i -D @types/papaparse
```

Rewrite `parseCsv` to use Papa Parse with `header: true`, then map results through the existing `idx` lookup. Papa handles quoted fields, escaped quotes, and embedded commas correctly.

**2c — Add migration helpers to header lookups:**

In the `col` object, add aliases so users can paste data with different reasonable header names:

```ts
const col = {
  name: idx(["name", "supplier", "supplier_name"]),
  property: idx(["property", "property_code"]),
  accountNumber: idx(["account_number", "account_no", "account", "accountnumber"]),
  addressPostcode: idx(["address_postcode", "postcode", "address_post_code", "addresspostcode"]),
  contactPhone: idx(["contact_phone", "phone", "telephone", "contactphone"]),
  email: idx(["email", "email_address"]),
  youcoContact: idx(["youco_contact", "youco_contact_name", "youcocontact"]),
  hyperlink: idx(["hyperlink", "url", "link", "website"]),
  notes: idx(["notes", "note"]),
  // (Section 3 will add payment_method and payment_day here)
};
```

(Remove `"contact"` from youcoContact aliases — it conflicts with phone fields.)

**Commit:** `fix(suppliers): proper CSV parser and camelCase header support`

---

## Section 3 — Add Payment Method and Payment Day columns

**Goal:** Two sortable columns so I can plan cashflow by payment day.

**3a — Schema (`shared/schema.ts`):**

Add to the `suppliers` pgTable:
```ts
paymentMethod: text("payment_method"),   // nullable; typical values: DD, SO, TRF, BACS, CARD, CHEQUE
paymentDay: integer("payment_day"),       // nullable; valid range 1-31
```

Don't forget to import `integer` from `drizzle-orm/pg-core`.

Update `insertSupplierSchema`:
```ts
paymentMethod: z.string().nullable().optional(),
paymentDay: z.number().int().min(1).max(31).nullable().optional(),
```

Update `csvRowSchema` and `upsertSchema` in `server/routes/suppliers.ts` with the same fields. For CSV, accept `paymentDay` as `z.coerce.number().int().min(1).max(31).nullable().optional()` since CSV values arrive as strings.

Update the `rows` mapper in the `/csv-import` route to include both new fields (insert `null` if absent).

**3b — Migration:**

Generate via:
```bash
npx drizzle-kit generate
```

This should produce `migrations/0002_payment_fields.sql` and update `migrations/meta/_journal.json`. Verify both files are tracked in git.

**3c — Backfill script:**

Create `script/backfill-payment-fields.ts`:

```ts
import { Pool } from "pg";

const p = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const PAY_RE = /Pay:\s*([A-Za-z]+)/;
const DAY_RE = /Day:\s*(\d{1,2})/;

async function main() {
  const { rows } = await p.query("SELECT id, notes FROM suppliers WHERE notes IS NOT NULL AND notes <> ''");
  let updated = 0;
  for (const r of rows) {
    const payMatch = r.notes.match(PAY_RE);
    const dayMatch = r.notes.match(DAY_RE);
    if (!payMatch && !dayMatch) continue;

    const method = payMatch ? payMatch[1].toUpperCase() : null;
    const day = dayMatch ? parseInt(dayMatch[1], 10) : null;

    // Strip the Pay: / Day: fragments from notes, leaving any other note content
    const cleanedNotes = r.notes
      .replace(PAY_RE, "")
      .replace(DAY_RE, "")
      .replace(/\|\s*\|/g, "|")
      .replace(/^\s*\|\s*|\s*\|\s*$/g, "")
      .trim();

    await p.query(
      "UPDATE suppliers SET payment_method = $1, payment_day = $2, notes = $3 WHERE id = $4",
      [method, day, cleanedNotes || null, r.id]
    );
    updated++;
  }
  console.log(`Backfilled ${updated} of ${rows.length} rows`);
  await p.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Add to `package.json` scripts:
```
"db:backfill-payments": "tsx script/backfill-payment-fields.ts"
```

**3d — Frontend (`client/src/pages/suppliers/Contacts.tsx`):**

- Add `Method` column (~60px) showing `paymentMethod`
- Add `Day` column (~50px) showing `paymentDay`, right-aligned
- Both sortable: extend `SortKey` type and sort comparator. For `paymentDay`, compare as numbers (nulls sort last regardless of asc/desc).
- Update Add and Edit Supplier modals: Method as `<select>` (DD / SO / TRF / BACS / CARD / CHEQUE / Other / blank); Day as `<input type="number" min="1" max="31">`
- Update `parseCsv` `col` object with new aliases:
  - `paymentMethod: idx(["payment_method", "pay_method", "method", "paymentmethod"])`
  - `paymentDay: idx(["payment_day", "pay_day", "day", "paymentday"])`
- Update `EMPTY_FORM` constant to include the two new fields with `null` defaults
- Update `SupplierForm` type to include them

**Commit:** `feat(suppliers): add payment method and payment day columns`

---

## Section 4 — UI polish on contacts table

**4a — Hyperlink column:** currently shows the literal word "Link" after every URL. Replace with just an external-link icon (lucide-react `ExternalLink`) that opens the URL in a new tab. If `hyperlink` is empty, render nothing (no em-dash, no icon).

**4b — Notes column:** not currently shown. Add as a small column with `truncate` + tooltip on hover showing full text. After Section 3's backfill, most rows will have empty notes, so this column should gracefully hide/de-emphasise when empty.

**4c — Horizontal overflow:** the supplier name truncates on the left edge of the table. Investigate the table's container CSS — likely a `flex` issue where the sidebar isn't properly accounting for table width. Either:

- Make the table scroll horizontally within its container (preferred — `overflow-x: auto` on the wrapper)
- Or reduce column widths so all fit at standard 1080p resolution

Test by viewing at 100% zoom on a 1920×1080 display: the supplier name and the action column (pencil/trash) should both be fully visible without horizontal scrolling.

**Commit:** `style(suppliers): polish hyperlink, notes, and table overflow`

---

## Section 5 — Deploy steps (you do these manually after Claude Code finishes)

After all sections are committed and pushed:

1. Wait for Render to auto-deploy from `master`. Check https://dashboard.render.com → youco-corporate → Events tab. If no new deploy appears within 2 minutes, hit "Manual Deploy → Deploy latest commit".

2. Once the deploy is live (green checkmark), open Render Shell:
   ```bash
   npm run db:migrate:prod
   ```
   You should see migration filenames printed (per Section 1). Confirm `0002_payment_fields` is in the list.

3. Verify the new columns exist:
   ```bash
   node -e "const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});p.query(\"SELECT column_name FROM information_schema.columns WHERE table_name='suppliers' ORDER BY ordinal_position\").then(r=>{console.table(r.rows);p.end();});"
   ```
   Expected: `payment_method` and `payment_day` should appear.

4. Backfill from existing notes:
   ```bash
   npm run db:backfill-payments
   ```
   Expected output: `"Backfilled ~75 of ~75 rows"` (most suppliers had Pay/Day data; about 6 didn't).

5. Refresh https://youco-corporate.onrender.com/suppliers/contacts — Method and Day columns should now be visible and populated. Click the Day column header to test sort.

---

## Notes for Claude Code

- The DATABASE_URL on Render is shared between youco-revenue and youco-corporate — be cautious with any cross-table assumptions.
- I'm logged in as nick / Admin (role = admin). Don't change anything that would lock me out.
- The audit log table (`audit_log`) already captures changes to suppliers via `logFieldChanges`. New `paymentMethod` and `paymentDay` updates should automatically show up there with no extra work needed — verify by editing a supplier after deploy.
- If anything in these instructions conflicts with `INTRANET-MIGRATION-HANDOVER.md` section 3.1 (Render deployment fixes), the handover wins. Those fixes were hard-won.
- Don't refactor anything not explicitly mentioned. Keep the diff focused.
