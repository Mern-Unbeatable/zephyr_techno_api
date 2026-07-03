/*
  Warnings:

  - You are about to drop the `PromoCodeCategoryBridge` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `createdAt` on table `PromoCodeModelBridge` required. This step will fail if there are existing NULL values in that column.
  - Made the column `isDeleted` on table `PromoCodeModelBridge` required. This step will fail if there are existing NULL values in that column.
  - Made the column `createdAt` on table `PromoCodeSeriesBridge` required. This step will fail if there are existing NULL values in that column.
  - Made the column `isDeleted` on table `PromoCodeSeriesBridge` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "PromoCodeCategoryBridge" DROP CONSTRAINT "PromoCodeCategoryBridge_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "PromoCodeCategoryBridge" DROP CONSTRAINT "PromoCodeCategoryBridge_promoCodeId_fkey";

-- AlterTable
ALTER TABLE "PromoCodeModelBridge" ALTER COLUMN "createdAt" SET NOT NULL,
ALTER COLUMN "isDeleted" SET NOT NULL;

-- AlterTable
ALTER TABLE "PromoCodeSeriesBridge" ALTER COLUMN "createdAt" SET NOT NULL,
ALTER COLUMN "isDeleted" SET NOT NULL;

-- DropTable
DROP TABLE "PromoCodeCategoryBridge";
