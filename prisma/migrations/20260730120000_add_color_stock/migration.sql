-- Per-color stock (same pattern as ProductStorageOption.stockQuantity)
ALTER TABLE "ProductColor" ADD COLUMN IF NOT EXISTS "stockQuantity" INTEGER NOT NULL DEFAULT 0;
