CREATE TABLE IF NOT EXISTS "portfolio_properties" (
	"id" serial PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"postcode" text,
	"ownership_entity" text NOT NULL DEFAULT 'YCO',
	"beneficial_share_pct" numeric(5,2),
	"purchase_date" date,
	"purchase_price" numeric(12,2),
	"capital_costs" numeric(12,2),
	"current_value_rics" numeric(12,2),
	"current_value_latent" numeric(12,2),
	"gross_annual_rent" numeric(12,2),
	"letting_units" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
