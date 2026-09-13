-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "siteId" TEXT;

-- CreateIndex
CREATE INDEX "StockMovement_siteId_idx" ON "StockMovement"("siteId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
