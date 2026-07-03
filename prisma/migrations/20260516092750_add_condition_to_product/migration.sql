/*
  Warnings:

  - Added the required column `conditionId` to the `Product` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "conditionId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Product_conditionId_idx" ON "Product"("conditionId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "Condition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
