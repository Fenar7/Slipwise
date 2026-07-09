-- AlterTable: add paymentTermsDays to customer (idempotent)
ALTER TABLE "customer" ADD COLUMN IF NOT EXISTS "paymentTermsDays" INTEGER NOT NULL DEFAULT 30;

-- AlterTable: add invoice autofill defaults to org_defaults (idempotent)
ALTER TABLE "org_defaults" ADD COLUMN IF NOT EXISTS "defaultInvoiceNotes" TEXT;
ALTER TABLE "org_defaults" ADD COLUMN IF NOT EXISTS "defaultInvoiceTerms" TEXT;
ALTER TABLE "org_defaults" ADD COLUMN IF NOT EXISTS "defaultInvoiceAuthorizedBy" TEXT;
