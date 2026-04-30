ALTER TABLE "mortgages" ADD COLUMN IF NOT EXISTS "erc_schedule" jsonb;
ALTER TABLE "mortgages" ADD COLUMN IF NOT EXISTS "product_fee" numeric(10,2);
ALTER TABLE "mortgages" ADD COLUMN IF NOT EXISTS "valuation_fee" numeric(10,2);
ALTER TABLE "mortgages" ADD COLUMN IF NOT EXISTS "legal_fee" numeric(10,2);
ALTER TABLE "mortgages" ADD COLUMN IF NOT EXISTS "redemption_fee" numeric(10,2);
