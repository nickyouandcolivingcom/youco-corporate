/**
 * Seeds the two application users: Nick (admin) and Joph (contributor).
 *
 * Usage:
 *   SEED_NICK_PASSWORD=<pass> SEED_JOPH_PASSWORD=<pass> tsx script/seed.ts
 *
 * Passwords are read from env vars — never hard-coded or printed.
 * Safe to re-run: uses ON CONFLICT DO UPDATE so existing records are updated.
 */

import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema.js";

const SALT_ROUNDS = 12;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const nickPassword = process.env.SEED_NICK_PASSWORD;
  const jophPassword = process.env.SEED_JOPH_PASSWORD;

  if (!nickPassword || !jophPassword) {
    console.error("Error: SEED_NICK_PASSWORD and SEED_JOPH_PASSWORD must be set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  console.log("Hashing passwords…");
  const [nickHash, jophHash] = await Promise.all([
    bcrypt.hash(nickPassword, SALT_ROUNDS),
    bcrypt.hash(jophPassword, SALT_ROUNDS),
  ]);

  const seeds = [
    { username: "nick", passwordHash: nickHash, role: "admin" as const },
    { username: "joph", passwordHash: jophHash, role: "contributor" as const },
  ];

  for (const user of seeds) {
    await db
      .insert(schema.users)
      .values(user)
      .onConflictDoUpdate({
        target: schema.users.username,
        set: {
          passwordHash: user.passwordHash,
          role: user.role,
        },
      });
    console.log(`  ✓ ${user.username} (${user.role})`);
  }

  console.log("Seed complete.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
