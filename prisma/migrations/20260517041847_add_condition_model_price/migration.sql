-- CreateTable
CREATE TABLE "ConditionModelPrice" (
    "id" TEXT NOT NULL,
    "conditionId" TEXT NOT NULL,
    "deviceModelId" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConditionModelPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConditionModelPrice_conditionId_idx" ON "ConditionModelPrice"("conditionId");

-- CreateIndex
CREATE INDEX "ConditionModelPrice_deviceModelId_idx" ON "ConditionModelPrice"("deviceModelId");

-- CreateIndex
CREATE UNIQUE INDEX "ConditionModelPrice_conditionId_deviceModelId_key" ON "ConditionModelPrice"("conditionId", "deviceModelId");

-- AddForeignKey
ALTER TABLE "ConditionModelPrice" ADD CONSTRAINT "ConditionModelPrice_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "Condition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConditionModelPrice" ADD CONSTRAINT "ConditionModelPrice_deviceModelId_fkey" FOREIGN KEY ("deviceModelId") REFERENCES "DeviceModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
