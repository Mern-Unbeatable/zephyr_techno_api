-- CreateIndex
CREATE INDEX "Product_isDeleted_idx" ON "Product"("isDeleted");

-- CreateIndex
CREATE INDEX "Product_categoryId_listingStatus_isDeleted_idx" ON "Product"("categoryId", "listingStatus", "isDeleted");

-- CreateIndex
CREATE INDEX "Product_createdAt_idx" ON "Product"("createdAt" DESC);
