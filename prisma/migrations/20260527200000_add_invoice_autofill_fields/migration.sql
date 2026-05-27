-- AlterTable: add paymentTermsDays to customer
ALTER TABLE "customer" ADD COLUMN "paymentTermsDays" INTEGER NOT NULL DEFAULT 30;

-- AlterTable: add invoice autofill defaults to org_defaults
ALTER TABLE "org_defaults" ADD COLUMN "defaultInvoiceNotes" TEXT;
ALTER TABLE "org_defaults" ADD COLUMN "defaultInvoiceTerms" TEXT;
ALTER TABLE "org_defaults" ADD COLUMN "defaultInvoiceAuthorizedBy" TEXT;
