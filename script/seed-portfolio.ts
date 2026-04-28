/**
 * Seeds portfolio_properties from the wealth statement (7 rows, Apr 2026 snapshot).
 *
 * Usage:
 *   DATABASE_URL=<url> tsx script/seed-portfolio.ts
 *
 * Safe to re-run: uses ON CONFLICT-style guard via address match. If a row with
 * the same address already exists, it is updated. Otherwise inserted.
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "../shared/schema.js";

interface Seed {
  address: string;
  postcode: string;
  ownershipEntity: "YCO" | "MONOCROM";
  beneficialSharePct: string;
  purchaseDate: string;
  purchasePrice: string;
  capitalCosts: string;
  currentValueRics: string;
  currentValueLatent: string;
  grossAnnualRent: string;
  lettingUnits: string;
}

const SEEDS: Seed[] = [
  {
    address: "16 Richmond Crescent, Chester",
    postcode: "CH3 5PB",
    ownershipEntity: "YCO",
    beneficialSharePct: "100.00",
    purchaseDate: "2017-10-09",
    purchasePrice: "190000",
    capitalCosts: "77223",
    currentValueRics: "414990",
    currentValueLatent: "450000",
    grossAnnualRent: "39300",
    lettingUnits: "5 ASTs 1 CT Bill",
  },
  {
    address: "10 Kensington Green, Chester",
    postcode: "CH4 8DZ",
    ownershipEntity: "YCO",
    beneficialSharePct: "100.00",
    purchaseDate: "2018-12-03",
    purchasePrice: "157500",
    capitalCosts: "78543",
    currentValueRics: "300000",
    currentValueLatent: "350000",
    grossAnnualRent: "40200",
    lettingUnits: "5 ASTs 1 CT Bill",
  },
  {
    address: "32 Lower Field Road, Chester",
    postcode: "CH4 7QF",
    ownershipEntity: "YCO",
    beneficialSharePct: "100.00",
    purchaseDate: "2018-12-14",
    purchasePrice: "230000",
    capitalCosts: "111641",
    currentValueRics: "425000",
    currentValueLatent: "525000",
    grossAnnualRent: "48600",
    lettingUnits: "6 ASTs 1 CT Bill",
  },
  {
    address: "84 Dicksons Drive, Chester",
    postcode: "CH2 2BR",
    ownershipEntity: "YCO",
    beneficialSharePct: "100.00",
    purchaseDate: "2019-07-26",
    purchasePrice: "190000",
    capitalCosts: "117614",
    currentValueRics: "450000",
    currentValueLatent: "550000",
    grossAnnualRent: "48540",
    lettingUnits: "6 ASTs 1 CT Bill",
  },
  {
    address: "4 Walpole Street, Chester",
    postcode: "CH1 4HG",
    ownershipEntity: "YCO",
    beneficialSharePct: "100.00",
    purchaseDate: "2021-03-22",
    purchasePrice: "295000",
    capitalCosts: "23799",
    currentValueRics: "415000",
    currentValueLatent: "500000",
    grossAnnualRent: "56220",
    lettingUnits: "7 ASTs 1 CT Bill",
  },
  {
    address: "26 Brook Lane, Chester",
    postcode: "CH2 2AP",
    ownershipEntity: "MONOCROM",
    beneficialSharePct: "100.00",
    purchaseDate: "2023-02-01",
    purchasePrice: "242500",
    capitalCosts: "8127",
    currentValueRics: "535000",
    currentValueLatent: "535000",
    grossAnnualRent: "50700",
    lettingUnits: "6 ASTs 1 CT Bill",
  },
  {
    address: "27 Brook Lane, Chester",
    postcode: "CH2 2AP",
    ownershipEntity: "YCO",
    beneficialSharePct: "100.00",
    purchaseDate: "2023-02-01",
    purchasePrice: "242500",
    capitalCosts: "8127",
    currentValueRics: "615000",
    currentValueLatent: "615000",
    grossAnnualRent: "57840",
    lettingUnits: "6 ASTs 1 CT Bill",
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
    const [existing] = await db
      .select()
      .from(schema.portfolioProperties)
      .where(eq(schema.portfolioProperties.address, s.address));

    if (existing) {
      await db
        .update(schema.portfolioProperties)
        .set({ ...s, updatedAt: new Date() })
        .where(eq(schema.portfolioProperties.id, existing.id));
      updated += 1;
    } else {
      await db.insert(schema.portfolioProperties).values(s);
      inserted += 1;
    }
  }

  console.log(`Portfolio seed complete: ${inserted} inserted, ${updated} updated`);
  await pool.end();
}

main().catch((err) => {
  console.error("Portfolio seed failed:", err);
  process.exit(1);
});
