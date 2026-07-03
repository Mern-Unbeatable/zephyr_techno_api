-- AlterTable
ALTER TABLE "ConditionModelPrice" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "ConditionModelPrice_isDeleted_idx" ON "ConditionModelPrice"("isDeleted");
