export function sumStorageStocks(storageOptions = []) {
  return storageOptions.reduce(
    (total, entry) => total + Math.max(0, Number(entry?.stockQuantity) || 0),
    0,
  );
}

export function resolveStorageStock(storageBridge, productStock = 0) {
  if (storageBridge && storageBridge.stockQuantity != null) {
    return Math.max(0, Number(storageBridge.stockQuantity) || 0);
  }
  return Math.max(0, Number(productStock) || 0);
}

export function resolveStoragePrice(storageBridge, productBasePrice = 0) {
  if (storageBridge?.price != null && storageBridge.price !== '') {
    return Math.max(0, Number(storageBridge.price) || 0);
  }
  return Math.max(0, Number(productBasePrice) || 0);
}

export function minStoragePrice(storageOptions = [], productBasePrice = 0) {
  if (!storageOptions.length) {
    return Math.max(0, Number(productBasePrice) || 0);
  }

  const prices = storageOptions
    .map((entry) => resolveStoragePrice(entry, productBasePrice))
    .filter((price) => price > 0);

  if (!prices.length) {
    return Math.max(0, Number(productBasePrice) || 0);
  }

  return Math.min(...prices);
}
export async function syncProductStockTotal(tx, productId) {
  const bridges = await tx.productStorageOption.findMany({
    where: { productId },
    select: { stockQuantity: true },
  });
  const total = sumStorageStocks(bridges);
  await tx.product.update({
    where: { id: productId },
    data: { stockQuantity: total },
  });
  return total;
}
