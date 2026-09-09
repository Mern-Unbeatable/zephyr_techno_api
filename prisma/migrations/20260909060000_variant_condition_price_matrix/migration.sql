-- Extend ProductVariantStock into Condition × Colour × Storage matrix (price/RRP/stock/express SoT).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) New columns on ProductVariantStock
ALTER TABLE "ProductVariantStock" ADD COLUMN IF NOT EXISTS "conditionCategoryId" TEXT;
ALTER TABLE "ProductVariantStock" ADD COLUMN IF NOT EXISTS "conditionKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ProductVariantStock" ADD COLUMN IF NOT EXISTS "price" DECIMAL(12, 2);
ALTER TABLE "ProductVariantStock" ADD COLUMN IF NOT EXISTS "compareAtPrice" DECIMAL(12, 2);

-- 2) Backfill price/RRP from storage option bridge when missing
UPDATE "ProductVariantStock" AS pvs
SET
  "price" = COALESCE(pvs."price", src.storage_price, src.base_price),
  "compareAtPrice" = COALESCE(pvs."compareAtPrice", src.storage_rrp, src.product_rrp)
FROM (
  SELECT
    pvs2.id AS id,
    pso."price" AS storage_price,
    pso."compareAtPrice" AS storage_rrp,
    p."basePrice" AS base_price,
    p."compareAtPrice" AS product_rrp
  FROM "ProductVariantStock" AS pvs2
  INNER JOIN "Product" AS p ON p.id = pvs2."productId"
  LEFT JOIN "ProductStorageOption" AS pso
    ON pso."productId" = pvs2."productId"
   AND pso."storageOptionId" = pvs2."storageOptionId"
   AND pso."isDeleted" = false
) AS src
WHERE pvs.id = src.id;

-- 3) Replace unique index (color×storage → conditionKey×color×storage)
DROP INDEX IF EXISTS "ProductVariantStock_productId_colorId_storageOptionId_key";

CREATE UNIQUE INDEX IF NOT EXISTS
  "ProductVariantStock_productId_conditionKey_colorId_storageOptionId_key"
  ON "ProductVariantStock" ("productId", "conditionKey", "colorId", "storageOptionId");

CREATE INDEX IF NOT EXISTS "ProductVariantStock_conditionCategoryId_idx"
  ON "ProductVariantStock"("conditionCategoryId");

-- 4) FK to Category for condition axis
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ProductVariantStock_conditionCategoryId_fkey'
  ) THEN
    ALTER TABLE "ProductVariantStock"
      ADD CONSTRAINT "ProductVariantStock_conditionCategoryId_fkey"
      FOREIGN KEY ("conditionCategoryId") REFERENCES "Category"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- 5) Expand rows for products that already have ProductCondition options
INSERT INTO "ProductVariantStock" (
  "id",
  "productId",
  "colorId",
  "storageOptionId",
  "conditionCategoryId",
  "conditionKey",
  "stockQuantity",
  "price",
  "compareAtPrice",
  "expressDeliveryEnabled"
)
SELECT
  gen_random_uuid()::text,
  base."productId",
  base."colorId",
  base."storageOptionId",
  pc."categoryId",
  pc."categoryId",
  CASE
    WHEN base.rn = 1 THEN COALESCE(pc."stockQuantity", 0)
    ELSE 0
  END,
  pc."price",
  pc."compareAtPrice",
  base."expressDeliveryEnabled"
FROM "ProductCondition" AS pc
INNER JOIN (
  SELECT
    pvs.*,
    ROW_NUMBER() OVER (
      PARTITION BY pvs."productId"
      ORDER BY pvs."colorId", pvs."storageOptionId"
    ) AS rn
  FROM "ProductVariantStock" AS pvs
  WHERE COALESCE(pvs."conditionKey", '') = ''
) AS base ON base."productId" = pc."productId"
WHERE pc."isDeleted" = false
ON CONFLICT ("productId", "conditionKey", "colorId", "storageOptionId") DO NOTHING;

ALTER TABLE "ProductCondition" ALTER COLUMN "price" SET DEFAULT 0;
