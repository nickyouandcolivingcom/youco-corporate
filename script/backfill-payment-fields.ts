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
