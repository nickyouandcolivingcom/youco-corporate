/**
 * Seeds the 10 Octopus + 3 EON electricity supply accounts. Octopus account
 * numbers were provided by Nick on 2026-04-29; EON went live July 2025 for
 * 27BLA/B/D (27BLC is tenant-paid, intentionally absent).
 *
 * Usage:
 *   DATABASE_URL=<url> tsx script/seed-energy-accounts.ts
 *
 * Safe to re-run: keys on (supplier, account_number) for Octopus, or
 * (supplier, property_code) for EON which has no account number yet.
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import * as schema from "../shared/schema.js";

interface Seed {
  supplier: string;
  propertyCode: string;
  accountNumber: string | null;
  fuelType: "Electricity" | "Gas" | "Dual";
  status: "Active" | "Closed" | "Disputed";
  notes?: string;
}

const SEEDS: Seed[] = [
  // ─── Octopus (10 accounts) ─────────────────────────────────────────────────
  { supplier: "Octopus", propertyCode: "84DD",  accountNumber: "A-72C1E760", fuelType: "Electricity", status: "Active" },
  { supplier: "Octopus", propertyCode: "4WS",   accountNumber: "A-109F5A6B", fuelType: "Electricity", status: "Active" },
  { supplier: "Octopus", propertyCode: "27BL",  accountNumber: "A-26F63293", fuelType: "Electricity", status: "Active", notes: "27BL freehold (communal)" },
  { supplier: "Octopus", propertyCode: "26BLA", accountNumber: "A-D9D78B72", fuelType: "Electricity", status: "Active" },
  { supplier: "Octopus", propertyCode: "26BLB", accountNumber: "A-29A4B3FE", fuelType: "Electricity", status: "Active" },
  { supplier: "Octopus", propertyCode: "26BLC", accountNumber: "A-16FF9E82", fuelType: "Electricity", status: "Active", notes: "26BLC currently tenant-paid; historical invoices imported for completeness" },
  { supplier: "Octopus", propertyCode: "26BL",  accountNumber: "A-90C87D45", fuelType: "Electricity", status: "Active", notes: "26BL freehold (communal)" },
  { supplier: "Octopus", propertyCode: "16RC",  accountNumber: "A-1D659703", fuelType: "Electricity", status: "Active" },
  { supplier: "Octopus", propertyCode: "10KG",  accountNumber: "A-2474F4DC", fuelType: "Electricity", status: "Active" },
  { supplier: "Octopus", propertyCode: "32LFR", accountNumber: "A-FF2EBA4D", fuelType: "Electricity", status: "Active" },

  // ─── EON (live July 2025 — invoice-only, no public consumption API) ─────────
  { supplier: "EON", propertyCode: "27BLA", accountNumber: null, fuelType: "Electricity", status: "Active", notes: "Live since July 2025" },
  { supplier: "EON", propertyCode: "27BLB", accountNumber: null, fuelType: "Electricity", status: "Active", notes: "Live since July 2025" },
  { supplier: "EON", propertyCode: "27BLD", accountNumber: null, fuelType: "Electricity", status: "Active", notes: "Live since July 2025" },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  let inserted = 0;
  let updated = 0;

  for (const s of SEEDS) {
    // Match by (supplier, account_number) when present, otherwise (supplier, property_code)
    const where = s.accountNumber
      ? and(
          eq(schema.energyAccounts.supplier, s.supplier),
          eq(schema.energyAccounts.accountNumber, s.accountNumber)
        )!
      : and(
          eq(schema.energyAccounts.supplier, s.supplier),
          eq(schema.energyAccounts.propertyCode, s.propertyCode)
        )!;

    const [existing] = await db.select().from(schema.energyAccounts).where(where);

    const payload = {
      supplier: s.supplier,
      propertyCode: s.propertyCode,
      accountNumber: s.accountNumber,
      fuelType: s.fuelType,
      status: s.status,
      notes: s.notes ?? null,
    };

    if (existing) {
      await db
        .update(schema.energyAccounts)
        .set({ ...payload, updatedAt: new Date() })
        .where(eq(schema.energyAccounts.id, existing.id));
      updated += 1;
    } else {
      await db.insert(schema.energyAccounts).values(payload);
      inserted += 1;
    }
  }

  console.log(`Energy accounts seed complete: ${inserted} inserted, ${updated} updated`);
  await pool.end();
}

main().catch((err) => {
  console.error("Energy accounts seed failed:", err);
  process.exit(1);
});
