-- Add PromoCodeSeriesBridge and PromoCodeModelBridge tables
CREATE TABLE IF NOT EXISTS "PromoCodeSeriesBridge" (
  "id" TEXT PRIMARY KEY,
  "promoCodeId" TEXT NOT NULL,
  "seriesId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT now(),
  "isDeleted" BOOLEAN DEFAULT false,
  "deletedAt" TIMESTAMP(3)
);

CREATE UNIQUE INDEX IF NOT EXISTS "PromoCodeSeriesBridge_promoCodeId_seriesId_key" ON "PromoCodeSeriesBridge"("promoCodeId", "seriesId");

CREATE TABLE IF NOT EXISTS "PromoCodeModelBridge" (
  "id" TEXT PRIMARY KEY,
  "promoCodeId" TEXT NOT NULL,
  "modelId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT now(),
  "isDeleted" BOOLEAN DEFAULT false,
  "deletedAt" TIMESTAMP(3)
);

CREATE UNIQUE INDEX IF NOT EXISTS "PromoCodeModelBridge_promoCodeId_modelId_key" ON "PromoCodeModelBridge"("promoCodeId", "modelId");

ALTER TABLE "PromoCodeSeriesBridge" ADD CONSTRAINT "PromoCodeSeriesBridge_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoCodeSeriesBridge" ADD CONSTRAINT "PromoCodeSeriesBridge_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PromoCodeModelBridge" ADD CONSTRAINT "PromoCodeModelBridge_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoCodeModelBridge" ADD CONSTRAINT "PromoCodeModelBridge_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "DeviceModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
