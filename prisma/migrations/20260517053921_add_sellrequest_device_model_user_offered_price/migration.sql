-- AlterTable
ALTER TABLE "SellRequest" ADD COLUMN     "deviceModelId" TEXT,
ADD COLUMN     "userOfferedPrice" DECIMAL(12,2);

-- CreateIndex
CREATE INDEX "SellRequest_deviceModelId_idx" ON "SellRequest"("deviceModelId");

-- AddForeignKey
ALTER TABLE "SellRequest" ADD CONSTRAINT "SellRequest_deviceModelId_fkey" FOREIGN KEY ("deviceModelId") REFERENCES "DeviceModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
