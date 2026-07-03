-- DropIndex
DROP INDEX "idx_product_isFeatured";

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "featuredAt" SET DATA TYPE TIMESTAMP(3);
