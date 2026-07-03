-- AlterTable
ALTER TABLE "ProductGallery" ADD COLUMN "colorId" TEXT;

-- CreateIndex
CREATE INDEX "ProductGallery_colorId_idx" ON "ProductGallery"("colorId");

-- AddForeignKey
ALTER TABLE "ProductGallery" ADD CONSTRAINT "ProductGallery_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "Color"("id") ON DELETE SET NULL ON UPDATE CASCADE;
