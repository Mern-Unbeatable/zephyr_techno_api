/*
  Warnings:

  - Added the required column `fullName` to the `UserAddress` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "shippingMethod" TEXT;

-- AlterTable
ALTER TABLE "UserAddress" ADD COLUMN     "fullName" TEXT NOT NULL,
ADD COLUMN     "phone" TEXT,
ALTER COLUMN "state" DROP NOT NULL;
