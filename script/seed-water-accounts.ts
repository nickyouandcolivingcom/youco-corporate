/**
 * Seeds the 12 expected Severn Trent water accounts.
 *
 * 5 freehold HMOs (16RC, 10KG, 32LFR, 84DD, 4WS) + 7 leasehold flats
 * (26BLA/B/C, 27BLA/B/C/D). 26BL and 27BL freeholds have no water accounts —
 * each flat has its own meter and bill.
 *
 * Account numbers are placeholders — the real ones come from the PDF imports.
 * This seed just creates rows so the user has something to attach invoices
 * to via the UI; user can edit each row after deploy to add the real
 * account_number and rateable_value from their bills.
 *
 * Usage:
 *   DATABASE_URL=<url> tsx script/seed-water-accounts.ts
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import * as schema from "../shared/schema.js";

interface Seed {
  supplier: string;
  propertyCode: string;
  notes?: string;
}

const SEEDS: Seed[] = [
  // 5 freehold HMOs
  { supplier: "Severn Trent", propertyCode: "16RC", notes: "Wastewater portion billed on behalf of Welsh Water" },
  { supplier: "Severn Trent", propertyCode: "10KG" },
  { supplier: "Severn Trent", propertyCode: "32LFR" },
  { supplier: "Severn Trent", propertyCode: "84DD" },
  { supplier: "Severn Trent", propertyCode: "4WS" },
  // 7 leasehold flats (separate metering + billing per flat)
  { supplier: "Severn Trent", propertyCode: "26BLA" },
  { supplier: "Severn Trent", propertyCode: "26BLB" },
  { supplier: "Severn Trent", propertyCode: "26BLC" },
  { supplier: "Severn Trent", propertyCode: "27BLA" },
  { supplier: "Severn Trent", propertyCode: "27BLB" },
  { supplier: "Severn Trent", propertyCode: "27BLC" },
  { supplier: "Severn Trent", propertyCode: "27BLD" },
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
      .from(schema.waterAccounts)
      .where(
        and(
          eq(schema.waterAccounts.supplier, s.supplier),
          eq(schema.waterAccounts.propertyCode, s.propertyCode)
        )
      );
    if (existing) {
      // Don't overwrite user-entered fields (account_number, rateable_value
      // etc.) — only sync notes if provided.
      if (s.notes && existing.notes !== s.notes) {
        await db
          .update(schema.waterAccounts)
          .set({ notes: s.notes, updatedAt: new Date() })
          .where(eq(schema.waterAccounts.id, existing.id));
        updated += 1;
      }
    } else {
      await db
        .insert(schema.waterAccounts)
        .values({
          supplier: s.supplier,
          propertyCode: s.propertyCode,
          notes: s.notes ?? null,
          billingFrequency: "Annual",
          status: "Active",
        });
      inserted += 1;
    }
  }

  console.log(`Water accounts seed: ${inserted} inserted, ${updated} updated`);
  await pool.end();
}

main().catch((err) => {
  console.error("Water accounts seed failed:", err);
  process.exit(1);
});
