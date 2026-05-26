-- CreateTable
CREATE TABLE "client_hub_customer_override" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "overrideConfig" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_hub_customer_override_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_hub_customer_override_customerId_key" ON "client_hub_customer_override"("customerId");

-- CreateIndex
CREATE INDEX "client_hub_customer_override_organizationId_idx" ON "client_hub_customer_override"("organizationId");

-- AddForeignKey
ALTER TABLE "client_hub_customer_override" ADD CONSTRAINT "client_hub_customer_override_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_hub_customer_override" ADD CONSTRAINT "client_hub_customer_override_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
