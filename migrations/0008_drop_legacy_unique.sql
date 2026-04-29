-- Migration 0007 tried to drop the old (account_id, reading_date) unique
-- constraint but used the wrong name. Postgres had auto-generated
-- "energy_readings_energy_account_id_reading_date_key" (the _key suffix is
-- PG's default for inline UNIQUE), but the drop statement looked for
-- "energy_readings_account_date_uniq" — the Drizzle TS name. The drop
-- silently no-op'd, leaving the old constraint in place.
--
-- Result: dual-fuel accounts (84DD/Gas, 4WS/Gas, 32LFR/Gas etc.) got
-- "duplicate key value violates unique constraint" when inserting a Gas
-- reading on the same date as an Electricity reading.
--
-- This migration drops the legacy constraint by its actual name.

ALTER TABLE "energy_readings"
	DROP CONSTRAINT IF EXISTS "energy_readings_energy_account_id_reading_date_key";
