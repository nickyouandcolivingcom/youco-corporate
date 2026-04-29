CREATE TABLE IF NOT EXISTS "energy_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"energy_account_id" integer REFERENCES "energy_accounts"("id") ON DELETE SET NULL,
	"property_code" text NOT NULL,
	"supplier" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"kwh" numeric(12,2),
	"amount" numeric(12,2) NOT NULL,
	"invoice_number" text,
	"source" text NOT NULL DEFAULT 'manual',
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "energy_invoices_property_period_idx"
	ON "energy_invoices" ("property_code", "period_start");
CREATE INDEX IF NOT EXISTS "energy_invoices_account_idx"
	ON "energy_invoices" ("energy_account_id");
