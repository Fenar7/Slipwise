-- CreateTable
CREATE TABLE "document_tag" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT,
    "description" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_tag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_tag_orgId_idx" ON "document_tag"("orgId");

-- CreateIndex
CREATE INDEX "document_tag_orgId_isArchived_idx" ON "document_tag"("orgId", "isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "document_tag_orgId_slug_key" ON "document_tag"("orgId", "slug");

-- AddForeignKey
ALTER TABLE "document_tag" ADD CONSTRAINT "document_tag_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
