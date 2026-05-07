-- CreateTable
CREATE TABLE "invoice_tag_assignment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "invoice_tag_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoice_tag_assignment_invoiceId_tagId_key" ON "invoice_tag_assignment"("invoiceId", "tagId");

-- CreateIndex
CREATE INDEX "invoice_tag_assignment_tagId_idx" ON "invoice_tag_assignment"("tagId");

-- AddForeignKey
ALTER TABLE "invoice_tag_assignment" ADD CONSTRAINT "invoice_tag_assignment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_tag_assignment" ADD CONSTRAINT "invoice_tag_assignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "document_tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "voucher_tag_assignment" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "voucher_tag_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "voucher_tag_assignment_voucherId_tagId_key" ON "voucher_tag_assignment"("voucherId", "tagId");

-- CreateIndex
CREATE INDEX "voucher_tag_assignment_tagId_idx" ON "voucher_tag_assignment"("tagId");

-- AddForeignKey
ALTER TABLE "voucher_tag_assignment" ADD CONSTRAINT "voucher_tag_assignment_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "voucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_tag_assignment" ADD CONSTRAINT "voucher_tag_assignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "document_tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "customer_default_tag" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "customer_default_tag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_default_tag_customerId_tagId_key" ON "customer_default_tag"("customerId", "tagId");

-- CreateIndex
CREATE INDEX "customer_default_tag_tagId_idx" ON "customer_default_tag"("tagId");

-- AddForeignKey
ALTER TABLE "customer_default_tag" ADD CONSTRAINT "customer_default_tag_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_default_tag" ADD CONSTRAINT "customer_default_tag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "document_tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "vendor_default_tag" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "vendor_default_tag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_default_tag_vendorId_tagId_key" ON "vendor_default_tag"("vendorId", "tagId");

-- CreateIndex
CREATE INDEX "vendor_default_tag_tagId_idx" ON "vendor_default_tag"("tagId");

-- AddForeignKey
ALTER TABLE "vendor_default_tag" ADD CONSTRAINT "vendor_default_tag_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_default_tag" ADD CONSTRAINT "vendor_default_tag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "document_tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
