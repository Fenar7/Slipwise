/*
  Warnings:

  - You are about to drop the `customer_default_tag` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `invoice_tag_assignment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `vendor_default_tag` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `voucher_tag_assignment` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "SequenceChangeType" AS ENUM ('CREATED', 'UPDATED', 'DEACTIVATED', 'REACTIVATED');

-- DropForeignKey
ALTER TABLE "customer_default_tag" DROP CONSTRAINT "customer_default_tag_customerId_fkey";

-- DropForeignKey
ALTER TABLE "customer_default_tag" DROP CONSTRAINT "customer_default_tag_tagId_fkey";

-- DropForeignKey
ALTER TABLE "invoice_tag_assignment" DROP CONSTRAINT "invoice_tag_assignment_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "invoice_tag_assignment" DROP CONSTRAINT "invoice_tag_assignment_tagId_fkey";

-- DropForeignKey
ALTER TABLE "vendor_default_tag" DROP CONSTRAINT "vendor_default_tag_tagId_fkey";

-- DropForeignKey
ALTER TABLE "vendor_default_tag" DROP CONSTRAINT "vendor_default_tag_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "voucher_tag_assignment" DROP CONSTRAINT "voucher_tag_assignment_tagId_fkey";

-- DropForeignKey
ALTER TABLE "voucher_tag_assignment" DROP CONSTRAINT "voucher_tag_assignment_voucherId_fkey";

-- AlterTable
ALTER TABLE "e_invoice_request" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- DropTable
DROP TABLE "customer_default_tag";

-- DropTable
DROP TABLE "invoice_tag_assignment";

-- DropTable
DROP TABLE "vendor_default_tag";

-- DropTable
DROP TABLE "voucher_tag_assignment";

-- CreateTable
CREATE TABLE "client_hub_org_config" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_hub_org_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequence_snapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "documentType" "SequenceDocumentType" NOT NULL,
    "periodicity" "SequencePeriodicity" NOT NULL,
    "isActive" BOOLEAN NOT NULL,
    "formatString" TEXT NOT NULL,
    "startCounter" INTEGER NOT NULL,
    "counterPadding" INTEGER NOT NULL,
    "totalConsumed" INTEGER NOT NULL DEFAULT 0,
    "periodsSnapshot" JSONB NOT NULL,
    "changeType" "SequenceChangeType" NOT NULL,
    "changeSummary" TEXT,
    "changedById" UUID NOT NULL,
    "changeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sequence_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_hub_org_config_organizationId_key" ON "client_hub_org_config"("organizationId");

-- CreateIndex
CREATE INDEX "sequence_snapshot_organizationId_documentType_idx" ON "sequence_snapshot"("organizationId", "documentType");

-- CreateIndex
CREATE INDEX "sequence_snapshot_sequenceId_createdAt_idx" ON "sequence_snapshot"("sequenceId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "sequence_snapshot_sequenceId_version_key" ON "sequence_snapshot"("sequenceId", "version");

-- AddForeignKey
ALTER TABLE "client_hub_org_config" ADD CONSTRAINT "client_hub_org_config_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_snapshot" ADD CONSTRAINT "sequence_snapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_snapshot" ADD CONSTRAINT "sequence_snapshot_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_snapshot" ADD CONSTRAINT "sequence_snapshot_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "document_tag_orgId_slug_key" RENAME TO "document_tag_org_slug_unique";
