-- Add storage to condition-model prices and sell requests (no data reset)

ALTER TABLE "ConditionModelPrice" ADD COLUMN "storageOptionId" TEXT;

ALTER TABLE "SellRequest" ADD COLUMN "storageOptionId" TEXT;

DROP INDEX IF EXISTS "ConditionModelPrice_conditionId_deviceModelId_key";

CREATE INDEX "ConditionModelPrice_storageOptionId_idx" ON "ConditionModelPrice"("storageOptionId");

CREATE UNIQUE INDEX "ConditionModelPrice_conditionId_deviceModelId_storageOptionId_key"
  ON "ConditionModelPrice"("conditionId", "deviceModelId", "storageOptionId");

CREATE INDEX "SellRequest_storageOptionId_idx" ON "SellRequest"("storageOptionId");

ALTER TABLE "ConditionModelPrice"
  ADD CONSTRAINT "ConditionModelPrice_storageOptionId_fkey"
  FOREIGN KEY ("storageOptionId") REFERENCES "StorageOption"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SellRequest"
  ADD CONSTRAINT "SellRequest_storageOptionId_fkey"
  FOREIGN KEY ("storageOptionId") REFERENCES "StorageOption"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
