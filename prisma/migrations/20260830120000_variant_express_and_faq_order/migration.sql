-- AlterTable
ALTER TABLE "ProductFaq" ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ProductVariantStock" ADD COLUMN "expressDeliveryEnabled" BOOLEAN NOT NULL DEFAULT true;
