CREATE TABLE IF NOT EXISTS "water_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier" text NOT NULL,
	"property_code" text NOT NULL,
	"account_number" text,
	"supply_address" text,
	"rateable_value" numeric(10,2),
	"billing_frequency" text NOT NULL DEFAULT 'Annual',
	"status" text NOT NULL DEFAULT 'Active',
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "water_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"water_account_id" integer REFERENCES "water_accounts"("id") ON DELETE SET NULL,
	"property_code" text NOT NULL,
	"supplier" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"amount" numeric(12,2) NOT NULL,
	"fresh_water_amount" numeric(12,2),
	"wastewater_amount" numeric(12,2),
	"standing_charge_amount" numeric(12,2),
	"invoice_number" text,
	"issue_date" date,
	"source" text NOT NULL DEFAULT 'manual',
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "water_invoices_property_period_idx"
	ON "water_invoices" ("property_code", "period_start");
