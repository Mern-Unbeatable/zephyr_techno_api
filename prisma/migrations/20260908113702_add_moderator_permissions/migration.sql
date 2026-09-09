-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'MODERATOR';

-- AlterTable
ALTER TABLE "ContactMessage" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- RenameIndex
ALTER INDEX "ConditionModelPrice_conditionId_deviceModelId_storageOptionId_k" RENAME TO "ConditionModelPrice_conditionId_deviceModelId_storageOption_key";

-- RenameIndex
ALTER INDEX "StockNotification_productId_colorId_storageOptionId_notifiedAt_" RENAME TO "StockNotification_productId_colorId_storageOptionId_notifie_idx";
