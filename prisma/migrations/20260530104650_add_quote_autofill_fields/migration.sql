-- AlterTable: add quote autofill defaults to org_defaults (idempotent)
ALTER TABLE "org_defaults" ADD COLUMN IF NOT EXISTS "defaultQuoteNotes" TEXT;
ALTER TABLE "org_defaults" ADD COLUMN IF NOT EXISTS "defaultQuoteTerms" TEXT;
