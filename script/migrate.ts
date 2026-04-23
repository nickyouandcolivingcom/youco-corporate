import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import path from "path";

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
await migrate(db, { migrationsFolder });
console.log("Migrations complete");

await pool.end();
