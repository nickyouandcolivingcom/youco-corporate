CREATE TABLE IF NOT EXISTS "broadband_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier" text NOT NULL,
	"property_code" text NOT NULL,
	"account_number" text,
	"login_email" text,
	"connection_type" text,
	"download_mbps" integer,
	"upload_mbps" integer,
	"contract_start" date,
	"contract_end" date,
	"monthly_cost" numeric(10,2),
	"next_price_increase_date" date,
	"next_price_increase_amount" numeric(10,2),
	"latest_invoice_date" date,
	"latest_invoice_amount" numeric(10,2),
	"tenant_paid" boolean NOT NULL DEFAULT false,
	"status" text NOT NULL DEFAULT 'Active',
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "broadband_accounts_property_idx"
	ON "broadband_accounts" ("property_code");
