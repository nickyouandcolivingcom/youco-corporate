/**
 * Seeds the 14 known electricity supply accounts (10 Octopus + 4 EON).
 *
 * Octopus: 8 historical (Jan 2023+) plus 26BL and 27BL freehold/communal
 *   supplies. 27BLC was on Octopus during the development period and continues
 *   on Octopus until tenancy was established.
 *
 * EON: went live July 2025 for the 27 Brook Lane flats. 27BLC is in Nick's
 *   EON dashboard but tenant-paid; included for visibility but flagged in
 *   notes so reporting/alerts can exclude it.
 *
 * Usage:
 *   DATABASE_URL=<url> tsx script/seed-energy-accounts.ts
 *
 * Safe to re-run: matches by (supplier, account_number) when present;
 * otherwise (supplier, property_code).
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

  // ─── EON Next (live July 2025; tariff "Next Fixed 12m v53" across all four) ─
  { supplier: "EON", propertyCode: "27BLA", accountNumber: "A-BEBE32A9", fuelType: "Electricity", status: "Active", notes: "Live July 2025; tariff Next Fixed 12m v53" },
  { supplier: "EON", propertyCode: "27BLB", accountNumber: "A-B1661B4C", fuelType: "Electricity", status: "Active", notes: "Live July 2025; tariff Next Fixed 12m v53" },
  { supplier: "EON", propertyCode: "27BLC", accountNumber: "A-D17B776F", fuelType: "Electricity", status: "Active", notes: "Tenant-paid — visible in Nick's EON dashboard but no liability; exclude from cost reporting" },
  { supplier: "EON", propertyCode: "27BLD", accountNumber: "A-F8569CBB", fuelType: "Electricity", status: "Active", notes: "Live July 2025; tariff Next Fixed 12m v53" },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  let inserted = 0;
  let updated = 0;

  for (const s of SEEDS) {
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
