# SESSION HANDOVER — 2026-04-27

**For:** next Claude session (chat or Code), or future Nick
**Companion to:** `INTRANET-MIGRATION-HANDOVER.md` (the broader project handover)
**Purpose:** Capture what changed today, what's queued tomorrow, and design context for Step 4 onwards

---

## 1. What landed today (youco-corporate hub)

Started the day with youco-corporate live but empty. Ended with a working supplier directory.

**Database & schema:**
- `suppliers` table created with full schema (12 columns + new payment fields)
- `0002_payment_fields` migration deployed — adds `payment_method` and `payment_day` (integer 1–31) columns
- All migrations now log applied filenames (no more silent skips)
- Smoke test in `script/migrate.ts` exits 1 if `suppliers` table missing post-migration

**Data:**
- 81 supplier rows imported (67 with email)
- 78 of 78 rows backfilled with payment method + day from notes field
- Notes field cleared of `Pay: / Day:` fragments — now ready for genuine notes

**Code fixes (committed and pushed):**
- `parseCsv` now uses Papa Parse (handles quoted fields, embedded commas)
- Header normaliser converts camelCase → snake_case so `accountNumber` / `account_number` / `account number` all match
- Hyperlink column renders as `ExternalLink` icon, no "Link" text
- Notes column added with truncate + tooltip
- Method and Day columns sortable in table; Method is a select in modals (DD/SO/TRF/BACS/CARD/CHEQUE/Other)

**Repo:** https://github.com/nickyouandcolivingcom/youco-corporate (master, all committed)

**Live URL:** https://youco-corporate.onrender.com — login: `nick` / `admin123` ⚠️ **change this**

---

## 2. Loose ends from today

| Item | Action | Where |
|---|---|---|
| Admin password still `admin123` | Change to something proper | Settings in youco-corporate |
| Joph password still `joph123` | Change | Same |
| Replit `14.401 Contact Management` | Rename `[ARCHIVED] 14.401`, delete in 14 days | Replit |
| Replit revenue apps (8 of them) | Rename `[ARCHIVED]`, delete in 14 days | Replit |
| Standalone Render apps (`youco-14306-market-demand`, `-14310-tenant-rotation`, `-14303-tenure`) | Suspend (don't delete), delete in 14 days | Render dashboard |
| youco-revenue Market Demand showing ~63% not 94% | Verify env vars | Render env tab on youco-revenue |

---

## 3. Tomorrow's plan (suppliers correspondence — gradual, ~1 month)

### The actual workflow Nick wants

Not bulk-send. Drafts per supplier (or per supplier-account where multiple), reviewed and sent individually. Some go by email, some need posted letters. ~1 hour/day pace.

### Three templates established (use verbatim)

**Variant A — Standard (suppliers, councils, software, professional bodies):**
- Subject: NOTIFICATION OF CHANGE OF CORRESPONDENCE ADDRESS
- Sender: Nicholas Davidson / Director / You & Co. Living
- Body says correspondence address only; registered office unchanged

**Variant B — Mortgage lenders (formal, registered office change):**
- Subject: NOTIFICATION OF CHANGE OF REGISTERED ADDRESS
- Body says registered address changed at Companies House
- Sender: Nicholas Davidson / Director / You & Co. Living
- ⚠️ See section 4 — DO NOT draft mortgage letters until reconciliation done

**Variant C — Utilities (Octopus, Severn Trent, Dyr Cymru, TV Licensing, BT, Council Tax):**
- Subject: Change of correspondence address — Account [N]
- Body informal, billing arrangements unchanged
- Sender: just "Nick Davidson" — no company line

### Key facts (memorise these for drafting)

- **New address:** NICHOLAS DAVIDSON, 66 Paul Street, London, EC2A 4NA
- **Effective date:** 26 April 2026
- **Old registered office:** 86-90 Paul Street, London, EC2A 4NE
- **Companies House:** changed to 66 Paul Street on 26 April 2026
- **Company number:** 10369433
- **Sender contacts:** 01244 835934 | nick@youandcoliving.com | www.youandcoliving.com
- **Multi-account suppliers:** combine into one letter for councils/utilities; separate letters for mortgage lenders

### Suggested drafting order

| Day | Suppliers | Variant | Notes |
|---|---|---|---|
| 1 | NRLA, ICAEW, ICO, SQUARESPACE, TAXCALC, XERO, Cheshire West & Chester (combined ×8) | A and C | Already drafted: NRLA + Cheshire West |
| 2 | Octopus (×10), Severn Trent (×8), Dyr Cymru, TV Licensing (×8), BT (×2 by post) | C | Bulk per supplier, multi-account |
| 3–4 | **Mortgage lenders — DO NOT START until section 4 below resolved** | B | |
| 5+ | Everything else, plus the 14 with no email (manual portal updates) | mix | |

### Drafts already produced (in earlier chat)

- ✅ NRLA (Variant A) — account 2177669
- ✅ Cheshire West & Chester (Variant C combined) — 8 council tax accounts. NB: 3 of the 8 accounts had no number in the import (26BL A/B/C); look up the actual Cheshire West refs before sending.

---

## 4. ⚠️ Mortgage data reconciliation needed (BLOCKER for Variant B drafting)

Cross-checked Kent Reliance + Landbay + LendInvest offer letters against the wealth statement and the youco-corporate suppliers import. Found discrepancies that need resolving before any formal lender correspondence.

### Discrepancy 1 — Kent Reliance account numbers

| Source | 16 Richmond Crescent | 10 Kensington Green | 27 Brook Lane |
|---|---|---|---|
| Wealth statement | 70038438 | 70047385 | 809084 |
| youco-corporate suppliers | 70038438 ✓ | 70047385 ✓ | (no row) |
| 2025 KR offer letter | — | — | 4001130500 |
| 2025 KR mailbag letter | references 70038438 + 70047385 + 71040055 | | |

→ Three different references for the 27 Brook Lane account (`809084`, `4001130500`, `71040055`). Which is canonical?

### Discrepancy 2 — Landbay 26 Brook Lane (3 flats)

| Flat | 2024 Landbay offer (case ref) | youco-corporate suppliers (account) |
|---|---|---|
| 26BL A | 70060243 | 10205340 |
| 26BL B | 70060256 | 10205341 |
| 26BL C | 70060258 | 10205342 |

→ Different number formats. Probably "case" vs "account" — but confirm with Landbay before quoting.

### Discrepancy 3 — Borrower entity for 26 Brook Lane

- 2024 Landbay offer letters: applicant **MONOCROM LIMITED**
- Wealth statement: ownership shown as **MONOCROM LIMITED** (only property in portfolio not under You & Co. Living Limited)

→ This means the registered-address-change letter for the three Landbay 26BL mortgages is a separate exercise. **MONOCROM LIMITED is a different company with a different company number**, and its registered office may or may not have changed too. Don't conflate.

### Recommended action before drafting Variant B letters

1. Reconcile the 3 Kent Reliance references for 27 Brook Lane — pick canonical
2. Confirm Landbay account vs case numbering with the lender
3. Determine MONOCROM LIMITED's separate registered address position
4. Update suppliers table in youco-corporate with correct numbers
5. Then draft mortgage letters using the corrected data

This is a 30-minute reconciliation task best done with the original lender portal logins open.

---

## 5. Step 4 — youco-corporate module build-out (Nick's vision)

Nick's design intent for tomorrow's strategic work:

> "Step 4 will be a design based on either Google Sheet and/or supplier documents to be uploaded into each module for extraction of key standing/consumption data."

### What this means in practice

Each new module (Mortgages, Compliance, Utilities, etc.) should have **two ingestion paths**:

1. **Google Sheet import** — for structured data Nick already maintains (e.g. wealth statement, EICR register)
2. **Document upload + extraction** — for unstructured PDFs/letters where the system extracts key fields (e.g. uploading a Landbay offer letter and the system pulls out: lender, account, property, balance, rate, fixed period, ERC schedule)

### Concrete data shape — Mortgages module (per Nick's wealth statement)

Source: wealth statement Google Sheet. Per-property fields:
- Full property address including postcode
- Beneficial ownership share (%)
- Yield (latent)
- Current value (latent)
- Current value (RICS)
- Original purchase date
- Original purchase price
- Capital costs (SDLT, legal, lease extensions)
- Gross yearly rental income
- Mortgage balance
- Annual mortgage interest
- Mortgage lender name
- Mortgage account number
- Number of letting units
- Ownership entity (You & Co. Living Limited or Monocrom Limited)
- Monthly mortgage interest
- Mortgage interest rate
- Equity
- Equity (latent)
- Refinancing date

Sample data Nick provided (7 properties, Apr 2026):
- Total portfolio value (latent): £3,525,000
- Total mortgage balance: £2,366,025
- Total annual mortgage interest: £108,937
- Total annual rent: £341,400
- Equity (across portfolio): £1,547,500

Refinancing dates ahead:
- 32 Lower Field Road — 3 Dec 2026 (Precise)
- 4 Walpole Street — 22 Sep 2026 (LendInvest)
- 16 Richmond Crescent — 31 May 2027 (Kent Reliance)
- 10 Kensington Green — 30 Sep 2027 (Kent Reliance)
- 26 Brook Lane — 9 May 2029 (Landbay)
- 27 Brook Lane — 10 Jul 2030 (Kent Reliance)
- 84 Dicksons Drive — 20 Sep 2027 (Landbay)

### Suggested Step 4 build order (per yesterday's plan)

1. **Compliance** first — highest legal exposure
2. **Mortgages** second — concrete data shape ready (above), refinancing dates approaching
3. **Utilities** third — ties to active disputes (Octopus 23L3568522, BG A31662776)
4. Stop. HR/Payroll/AP/Financials/Treasury duplicate Xero — skip unless specific pain emerges.

---

## 6. Open questions for next session

1. **Mortgage account reconciliation** (section 4 above) — Nick needs to do this manually with lender portals open
2. **Step 4 module design** — Nick wants Google Sheet + document-upload ingestion. Whoever builds Compliance first will set the architectural pattern for the others. Worth a focused design conversation before coding.
3. **MONOCROM LIMITED** — separate company, separate Companies House, separate registered office? Affects mortgage correspondence for 26 Brook Lane only.

---

## 7. Things NOT to do

- ❌ Don't bulk-send the address-change emails. Per-supplier drafting only.
- ❌ Don't delete the Replit apps yet. Archive only. 14-day cooling period.
- ❌ Don't draft Variant B (mortgage) letters until section 4 reconciliation done.
- ❌ Don't build HR/Payroll/AP modules — Xero already does this. Wait for specific pain.
- ❌ Don't forget the hyperlink column was polished and the parser was fixed — those are committed. Don't redo.

---

## 8. Files of record

- `INTRANET-MIGRATION-HANDOVER.md` — broader project context (do not modify)
- `SESSION-HANDOVER-2026-04-27.md` — this file
- `prompts/improvements-2026-04-27.md` — the consolidated prompt that drove today's Claude Code session (still valid as reference for prompt-writing patterns)

---

## 9. To resume tomorrow

Paste this whole file into a fresh Claude conversation, then say:

> "Read this handover. Today I want to: [pick one]
> - draft address-change letters for [supplier name(s)] using Variant [A/B/C]
> - reconcile the mortgage account numbers (section 4)
> - design the Compliance module (Step 4)"

The next Claude will be up to speed in 30 seconds instead of an hour.
