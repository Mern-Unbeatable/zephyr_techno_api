-- Add per-storage stock on product storage bridge rows
ALTER TABLE "ProductStorageOption" ADD COLUMN "stockQuantity" INTEGER NOT NULL DEFAULT 0;

-- Backfill from product-level stock for existing listings
UPDATE "ProductStorageOption" pso
SET "stockQuantity" = p."stockQuantity"
FROM "Product" p
WHERE pso."productId" = p.id;
