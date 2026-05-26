-- CreateTable
CREATE TABLE "client_hub_org_config" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_hub_org_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_hub_org_config_organizationId_key" ON "client_hub_org_config"("organizationId");

-- AddForeignKey
ALTER TABLE "client_hub_org_config" ADD CONSTRAINT "client_hub_org_config_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
