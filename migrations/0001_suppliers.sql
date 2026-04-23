CREATE TABLE IF NOT EXISTS "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"property" text NOT NULL DEFAULT 'ALL',
	"account_number" text,
	"address_postcode" text,
	"contact_phone" text,
	"email" text,
	"youco_contact" text,
	"hyperlink" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
