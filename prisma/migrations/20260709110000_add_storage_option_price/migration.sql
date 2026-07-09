-- Add per-storage price on product storage bridge rows
ALTER TABLE "ProductStorageOption" ADD COLUMN "price" DECIMAL(12,2);

-- Backfill from product base price for existing rows
UPDATE "ProductStorageOption" AS pso
SET "price" = p."basePrice"
FROM "Product" AS p
WHERE pso."productId" = p."id"
  AND pso."price" IS NULL;
