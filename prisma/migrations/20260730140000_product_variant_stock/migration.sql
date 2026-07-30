-- CreateTable
CREATE TABLE "ProductVariantStock" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "colorId" TEXT NOT NULL,
    "storageOptionId" TEXT NOT NULL,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductVariantStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariantStock_productId_colorId_storageOptionId_key" ON "ProductVariantStock"("productId", "colorId", "storageOptionId");

-- CreateIndex
CREATE INDEX "ProductVariantStock_productId_idx" ON "ProductVariantStock"("productId");

-- CreateIndex
CREATE INDEX "ProductVariantStock_colorId_idx" ON "ProductVariantStock"("colorId");

-- CreateIndex
CREATE INDEX "ProductVariantStock_storageOptionId_idx" ON "ProductVariantStock"("storageOptionId");

-- AddForeignKey
ALTER TABLE "ProductVariantStock" ADD CONSTRAINT "ProductVariantStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantStock" ADD CONSTRAINT "ProductVariantStock_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "Color"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantStock" ADD CONSTRAINT "ProductVariantStock_storageOptionId_fkey" FOREIGN KEY ("storageOptionId") REFERENCES "StorageOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: split each storage stock evenly across that product's colors.
-- If color-level stock was already set (>0), cap each cell with that color stock.
INSERT INTO "ProductVariantStock" ("id", "productId", "colorId", "storageOptionId", "stockQuantity")
SELECT
  gen_random_uuid()::text,
  pc."productId",
  pc."colorId",
  pso."storageOptionId",
  GREATEST(
    0,
    CASE
      WHEN COALESCE(pc."stockQuantity", 0) > 0 THEN
        LEAST(
          pc."stockQuantity",
          FLOOR(
            COALESCE(pso."stockQuantity", 0)::numeric
            / GREATEST(
              (SELECT COUNT(*)::numeric FROM "ProductColor" c2 WHERE c2."productId" = pc."productId" AND c2."isDeleted" = false),
              1
            )
          )::int
        )
      ELSE
        FLOOR(
          COALESCE(pso."stockQuantity", 0)::numeric
          / GREATEST(
            (SELECT COUNT(*)::numeric FROM "ProductColor" c2 WHERE c2."productId" = pc."productId" AND c2."isDeleted" = false),
            1
          )
        )::int
    END
  )
FROM "ProductColor" pc
INNER JOIN "ProductStorageOption" pso
  ON pso."productId" = pc."productId"
 AND pso."isDeleted" = false
WHERE pc."isDeleted" = false;
