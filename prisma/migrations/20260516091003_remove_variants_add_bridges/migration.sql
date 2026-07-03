/*
  Warnings:

  - You are about to drop the column `productVariantId` on the `CartItem` table. All the data in the column will be lost.
  - You are about to drop the column `productVariantId` on the `OrderItem` table. All the data in the column will be lost.
  - You are about to drop the `ProductVariant` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `colorId` to the `CartItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `productId` to the `CartItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ramOptionId` to the `CartItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storageOptionId` to the `CartItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `colorId` to the `OrderItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `productId` to the `OrderItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ramOptionId` to the `OrderItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storageOptionId` to the `OrderItem` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_productVariantId_fkey";

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_productVariantId_fkey";

-- DropForeignKey
ALTER TABLE "ProductVariant" DROP CONSTRAINT "ProductVariant_colorId_fkey";

-- DropForeignKey
ALTER TABLE "ProductVariant" DROP CONSTRAINT "ProductVariant_conditionId_fkey";

-- DropForeignKey
ALTER TABLE "ProductVariant" DROP CONSTRAINT "ProductVariant_productId_fkey";

-- DropForeignKey
ALTER TABLE "ProductVariant" DROP CONSTRAINT "ProductVariant_ramOptionId_fkey";

-- DropForeignKey
ALTER TABLE "ProductVariant" DROP CONSTRAINT "ProductVariant_storageOptionId_fkey";

-- DropIndex
DROP INDEX "OrderItem_productVariantId_idx";

-- AlterTable
ALTER TABLE "CartItem" DROP COLUMN "productVariantId",
ADD COLUMN     "colorId" TEXT NOT NULL,
ADD COLUMN     "productId" TEXT NOT NULL,
ADD COLUMN     "ramOptionId" TEXT NOT NULL,
ADD COLUMN     "storageOptionId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "OrderItem" DROP COLUMN "productVariantId",
ADD COLUMN     "colorId" TEXT NOT NULL,
ADD COLUMN     "productId" TEXT NOT NULL,
ADD COLUMN     "ramOptionId" TEXT NOT NULL,
ADD COLUMN     "storageOptionId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "stockQuantity" INTEGER NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "ProductVariant";

-- CreateTable
CREATE TABLE "ProductColor" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "colorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductColor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductStorageOption" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "storageOptionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductStorageOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductRamOption" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "ramOptionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductRamOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductColor_productId_idx" ON "ProductColor"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductColor_productId_colorId_key" ON "ProductColor"("productId", "colorId");

-- CreateIndex
CREATE INDEX "ProductStorageOption_productId_idx" ON "ProductStorageOption"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductStorageOption_productId_storageOptionId_key" ON "ProductStorageOption"("productId", "storageOptionId");

-- CreateIndex
CREATE INDEX "ProductRamOption_productId_idx" ON "ProductRamOption"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductRamOption_productId_ramOptionId_key" ON "ProductRamOption"("productId", "ramOptionId");

-- CreateIndex
CREATE INDEX "CartItem_productId_idx" ON "CartItem"("productId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- AddForeignKey
ALTER TABLE "ProductColor" ADD CONSTRAINT "ProductColor_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductColor" ADD CONSTRAINT "ProductColor_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "Color"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStorageOption" ADD CONSTRAINT "ProductStorageOption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStorageOption" ADD CONSTRAINT "ProductStorageOption_storageOptionId_fkey" FOREIGN KEY ("storageOptionId") REFERENCES "StorageOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRamOption" ADD CONSTRAINT "ProductRamOption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRamOption" ADD CONSTRAINT "ProductRamOption_ramOptionId_fkey" FOREIGN KEY ("ramOptionId") REFERENCES "RamOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "Color"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_storageOptionId_fkey" FOREIGN KEY ("storageOptionId") REFERENCES "StorageOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_ramOptionId_fkey" FOREIGN KEY ("ramOptionId") REFERENCES "RamOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "Color"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_storageOptionId_fkey" FOREIGN KEY ("storageOptionId") REFERENCES "StorageOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_ramOptionId_fkey" FOREIGN KEY ("ramOptionId") REFERENCES "RamOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
