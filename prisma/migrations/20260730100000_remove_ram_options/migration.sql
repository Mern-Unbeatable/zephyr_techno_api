-- Remove RamOption / ProductRamOption and ramOptionId from cart/order items

-- 1. Drop FK constraints
ALTER TABLE "CartItem" DROP CONSTRAINT IF EXISTS "CartItem_ramOptionId_fkey";
ALTER TABLE "OrderItem" DROP CONSTRAINT IF EXISTS "OrderItem_ramOptionId_fkey";
ALTER TABLE "ProductRamOption" DROP CONSTRAINT IF EXISTS "ProductRamOption_productId_fkey";
ALTER TABLE "ProductRamOption" DROP CONSTRAINT IF EXISTS "ProductRamOption_ramOptionId_fkey";

-- 2. Drop columns
ALTER TABLE "CartItem" DROP COLUMN IF EXISTS "ramOptionId";
ALTER TABLE "OrderItem" DROP COLUMN IF EXISTS "ramOptionId";

-- 3. Drop ProductRamOption table
DROP TABLE IF EXISTS "ProductRamOption";

-- 4. Drop RamOption table
DROP TABLE IF EXISTS "RamOption";
