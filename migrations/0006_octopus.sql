ALTER TABLE "energy_accounts" ADD COLUMN IF NOT EXISTS "meter_serial" text;--> statement-breakpoint
ALTER TABLE "energy_accounts" ADD COLUMN IF NOT EXISTS "tariff_code" text;--> statement-breakpoint
ALTER TABLE "energy_accounts" ADD COLUMN IF NOT EXISTS "last_sync_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "energy_readings" (
	"id" serial PRIMARY KEY NOT NULL,
	"energy_account_id" integer NOT NULL REFERENCES "energy_accounts"("id") ON DELETE CASCADE,
	"reading_date" date NOT NULL,
	"kwh" numeric(12,4) NOT NULL,
	"cost_pence" numeric(12,2),
	"source" text NOT NULL DEFAULT 'octopus_api',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	UNIQUE ("energy_account_id", "reading_date")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "energy_readings_account_date_idx"
	ON "energy_readings" ("energy_account_id", "reading_date");
