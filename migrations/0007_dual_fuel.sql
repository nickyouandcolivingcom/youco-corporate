ALTER TABLE "energy_accounts" RENAME COLUMN "meter_serial" TO "electricity_meter_serial";--> statement-breakpoint
ALTER TABLE "energy_accounts" ADD COLUMN IF NOT EXISTS "gas_meter_serial" text;--> statement-breakpoint
ALTER TABLE "energy_readings" ADD COLUMN IF NOT EXISTS "fuel_type" text NOT NULL DEFAULT 'Electricity';--> statement-breakpoint
ALTER TABLE "energy_readings" DROP CONSTRAINT IF EXISTS "energy_readings_account_date_uniq";--> statement-breakpoint
ALTER TABLE "energy_readings" ADD CONSTRAINT "energy_readings_account_fuel_date_uniq" UNIQUE ("energy_account_id", "fuel_type", "reading_date");
