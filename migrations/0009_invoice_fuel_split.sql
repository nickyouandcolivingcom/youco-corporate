ALTER TABLE "energy_invoices" ADD COLUMN IF NOT EXISTS "electricity_kwh" numeric(12,2);--> statement-breakpoint
ALTER TABLE "energy_invoices" ADD COLUMN IF NOT EXISTS "gas_kwh" numeric(12,2);--> statement-breakpoint
ALTER TABLE "energy_invoices" ADD COLUMN IF NOT EXISTS "electricity_amount" numeric(12,2);--> statement-breakpoint
ALTER TABLE "energy_invoices" ADD COLUMN IF NOT EXISTS "gas_amount" numeric(12,2);--> statement-breakpoint
ALTER TABLE "energy_invoices" ADD COLUMN IF NOT EXISTS "vat_amount" numeric(12,2);--> statement-breakpoint
ALTER TABLE "energy_invoices" ADD COLUMN IF NOT EXISTS "e_reading_type" text;--> statement-breakpoint
ALTER TABLE "energy_invoices" ADD COLUMN IF NOT EXISTS "g_reading_type" text;--> statement-breakpoint
ALTER TABLE "energy_invoices" ADD COLUMN IF NOT EXISTS "e_reading_date" date;--> statement-breakpoint
ALTER TABLE "energy_invoices" ADD COLUMN IF NOT EXISTS "g_reading_date" date;
