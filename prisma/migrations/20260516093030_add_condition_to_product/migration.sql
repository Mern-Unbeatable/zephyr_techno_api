-- DropForeignKey
ALTER TABLE "SellRequest" DROP CONSTRAINT "SellRequest_conditionId_fkey";

-- AlterTable
ALTER TABLE "SellRequest" ALTER COLUMN "conditionId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "SellRequest" ADD CONSTRAINT "SellRequest_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "Condition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
