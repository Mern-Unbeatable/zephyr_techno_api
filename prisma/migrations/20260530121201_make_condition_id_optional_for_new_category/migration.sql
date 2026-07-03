/*
  Warnings:

  - The values [REVIEWING] on the enum `BusinessFormStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "BusinessFormStatus_new" AS ENUM ('NEW', 'CONTACTED', 'CLOSED');
ALTER TABLE "public"."BusinessForm" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "BusinessForm" ALTER COLUMN "status" TYPE "BusinessFormStatus_new" USING ("status"::text::"BusinessFormStatus_new");
ALTER TYPE "BusinessFormStatus" RENAME TO "BusinessFormStatus_old";
ALTER TYPE "BusinessFormStatus_new" RENAME TO "BusinessFormStatus";
DROP TYPE "public"."BusinessFormStatus_old";
ALTER TABLE "BusinessForm" ALTER COLUMN "status" SET DEFAULT 'NEW';
COMMIT;

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_conditionId_fkey";

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "conditionId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "Condition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
