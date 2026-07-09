-- AlterTable: add voucher autofill defaults to org_defaults (idempotent)
ALTER TABLE "org_defaults" ADD COLUMN IF NOT EXISTS "defaultVoucherNotes" TEXT;
ALTER TABLE "org_defaults" ADD COLUMN IF NOT EXISTS "defaultVoucherApprovedBy" TEXT;
ALTER TABLE "org_defaults" ADD COLUMN IF NOT EXISTS "defaultVoucherReceivedBy" TEXT;
ALTER TABLE "org_defaults" ADD COLUMN IF NOT EXISTS "defaultVoucherPaymentMode" TEXT;
