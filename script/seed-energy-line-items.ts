/**
 * Seeds the historical energy invoice line-items parsed from
 * "14.401 ENERGY USAGE ANALYSIS" Google Sheet (the line-item detail tabs).
 * 366 rows covering 16RC, 10KG, 32LFR, 84DD, 4WS from 2018 onwards across
 * suppliers BULB, SHELL, OCTOPUS, B GAS, GREEN, AVRO, OVO.
 *
 * The 26BLA/B/C flats are NOT covered by these line items — they only
 * appear in the wide-format aggregate sheet (already imported as
 * csv_import rows). We preserve those wide-format rows for the 26BL flats.
 *
 * For the 5 freehold properties, this script first deletes the existing
 * csv_import aggregate rows, then inserts the 366 line items. Net effect:
 *   - 26BLA/B/C: still on aggregate (no line-item data exists)
 *   - 16RC, 10KG, 32LFR, 84DD, 4WS: replaced with line items (more granular)
 *
 * Usage:
 *   DATABASE_URL=<url> tsx script/seed-energy-line-items.ts
 *
 * Safe to re-run: each run deletes existing freehold csv_import rows then
 * re-inserts the line items, so totals stay consistent.
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, inArray } from "drizzle-orm";
import { readFileSync } from "fs";
import path from "path";
import * as schema from "../shared/schema.js";

const FREEHOLD_PROPERTIES = ["16RC", "10KG", "32LFR", "84DD", "4WS"];

interface LineItem {
  supplier: string;
  propertyCode: string;
  periodStart: string;
  periodEnd: string;
  electricityKwh: number | null;
  gasKwh: number | null;
  electricityAmount: number | null;
  gasAmount: number | null;
  vatAmount: number | null;
  amount: number;
  eReadingType: string | null;
  gReadingType: string | null;
  eReadingDate: string | null;
  gReadingDate: string | null;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const jsonPath = path.join(process.cwd(), "script", "energy-line-items.json");
  const items = JSON.parse(readFileSync(jsonPath, "utf-8")) as LineItem[];
  console.log(`Loaded ${items.length} line items from ${jsonPath}`);

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  // Step 1: delete existing csv_import aggregate rows for the 5 freeholds
  // (keeps the 26BL flat aggregate rows intact since no line items cover them)
  const deleted = await db
    .delete(schema.energyInvoices)
    .where(
      and(
        eq(schema.energyInvoices.source, "csv_import"),
        inArray(schema.energyInvoices.propertyCode, FREEHOLD_PROPERTIES)
      )
    )
    .returning();
  console.log(`Deleted ${deleted.length} freehold aggregate rows`);

  // Step 2: insert the 366 line items, batch by 100
  const toInsert = items.map((r) => ({
    propertyCode: r.propertyCode,
    supplier: r.supplier,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    electricityKwh: r.electricityKwh != null ? String(r.electricityKwh) : null,
    gasKwh: r.gasKwh != null ? String(r.gasKwh) : null,
    amount: String(r.amount ?? 0),
    electricityAmount:
      r.electricityAmount != null ? String(r.electricityAmount) : null,
    gasAmount: r.gasAmount != null ? String(r.gasAmount) : null,
    vatAmount: r.vatAmount != null ? String(r.vatAmount) : null,
    source: "csv_import" as const,
    eReadingType: r.eReadingType,
    gReadingType: r.gReadingType,
    eReadingDate: r.eReadingDate,
    gReadingDate: r.gReadingDate,
  }));

  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    await db.insert(schema.energyInvoices).values(batch);
    inserted += batch.length;
  }
  console.log(`Inserted ${inserted} line items`);

  // Step 3: report totals for sanity
  const all = await db.select().from(schema.energyInvoices);
  const totalAmount = all.reduce((a, r) => a + Number(r.amount ?? 0), 0);
  const totalEKwh = all.reduce(
    (a, r) => a + (r.electricityKwh != null ? Number(r.electricityKwh) : 0),
    0
  );
  const totalGKwh = all.reduce(
    (a, r) => a + (r.gasKwh != null ? Number(r.gasKwh) : 0),
    0
  );
  console.log(
    `Final state: ${all.length} invoices, total £${totalAmount.toFixed(2)}, ` +
      `${totalEKwh.toFixed(2)} kWh elec, ${totalGKwh.toFixed(2)} kWh gas`
  );

  await pool.end();
}

main().catch((err) => {
  console.error("Energy line items seed failed:", err);
  process.exit(1);
});
