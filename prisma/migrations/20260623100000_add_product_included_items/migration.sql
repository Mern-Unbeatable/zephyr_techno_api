-- CreateTable
CREATE TABLE "ProductIncludedItem" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductIncludedItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductIncludedItem_productId_idx" ON "ProductIncludedItem"("productId");

-- AddForeignKey
ALTER TABLE "ProductIncludedItem" ADD CONSTRAINT "ProductIncludedItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
