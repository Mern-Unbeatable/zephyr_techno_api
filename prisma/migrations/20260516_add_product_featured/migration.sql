-- Migration: add isFeatured and featuredAt to Product

ALTER TABLE "Product" ADD COLUMN "isFeatured" boolean NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "featuredAt" timestamp;

-- Optional index for fast lookup of featured products
CREATE INDEX IF NOT EXISTS "idx_product_isFeatured" ON "Product" ("isFeatured");
