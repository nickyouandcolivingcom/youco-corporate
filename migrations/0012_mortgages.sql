CREATE TABLE IF NOT EXISTS "mortgages" (
	"id" serial PRIMARY KEY NOT NULL,
	"lender" text NOT NULL,
	"property_code" text NOT NULL,
	"borrower_entity" text NOT NULL DEFAULT 'YCO',
	"account_number" text,
	"lender_reference" text,
	"offer_date" date,
	"completion_date" date,
	"expiry_date" date,
	"loan_amount" numeric(12,2),
	"valuation" numeric(12,2),
	"term_months" integer,
	"repayment_type" text,
	"fixed_rate_pct" numeric(6,3),
	"fixed_period_months" integer,
	"fixed_end_date" date,
	"reversionary_margin_pct" numeric(6,3),
	"reversionary_floor_pct" numeric(6,3),
	"monthly_payment_fixed" numeric(12,2),
	"status" text NOT NULL DEFAULT 'Active',
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "mortgages_property_idx" ON "mortgages" ("property_code");
CREATE INDEX IF NOT EXISTS "mortgages_lender_idx" ON "mortgages" ("lender");
