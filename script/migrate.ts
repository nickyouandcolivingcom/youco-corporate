import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import path from "path";
import { readFileSync } from "fs";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

// In production the build copies migrations/ → dist/migrations/
// In dev, fall back to the repo-root migrations/ folder
const migrationsFolder =
  process.env.NODE_ENV === "production"
    ? path.join(process.cwd(), "dist", "migrations")
    : path.join(process.cwd(), "migrations");

console.log("Running migrations from", migrationsFolder);

async function getAppliedCount(): Promise<number> {
  try {
    const { rows } = await pool.query(`SELECT count(*) FROM drizzle.__drizzle_migrations`);
    return parseInt(rows[0].count, 10);
  } catch {
    return 0;
  }
}

const journal = JSON.parse(
  readFileSync(path.join(migrationsFolder, "meta/_journal.json"), "utf-8")
) as { entries: Array<{ tag: string }> };

const beforeCount = await getAppliedCount();
await migrate(db, { migrationsFolder });
const afterCount = await getAppliedCount();

const newCount = afterCount - beforeCount;
if (newCount === 0) {
  console.log("No new migrations to apply");
} else {
  const newEntries = journal.entries.slice(beforeCount, afterCount);
  for (const entry of newEntries) {
    console.log(`Applied migration: ${entry.tag}`);
  }
}

// Smoke test: fail loudly if suppliers table is missing after migrations
const { rows: tableCheck } = await pool.query(
  `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'suppliers'`
);
if (tableCheck.length === 0) {
  console.error("FATAL: suppliers table does not exist after migrations!");
  await pool.end();
  process.exit(1);
}
console.log("Smoke test passed: suppliers table exists");
console.log("Migrations complete");

await pool.end();
