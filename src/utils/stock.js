export function sumStorageStocks(storageOptions = []) {
  return storageOptions.reduce(
    (total, entry) => total + Math.max(0, Number(entry?.stockQuantity) || 0),
    0,
  );
}

export function sumColorStocks(colorOptions = []) {
  return colorOptions.reduce(
    (total, entry) => total + Math.max(0, Number(entry?.stockQuantity) || 0),
    0,
  );
}

export function sumVariantStocks(variantStocks = []) {
  return variantStocks.reduce(
    (total, entry) => total + Math.max(0, Number(entry?.stockQuantity) || 0),
    0,
  );
}

export function variantStockKey(colorId, storageOptionId) {
  return `${colorId}::${storageOptionId}`;
}

export function storageSizeInGb(name) {
  const match = String(name || '')
    .trim()
    .match(/^(\d+(?:\.\d+)?)\s*(tb|gb|mb)?$/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const value = parseFloat(match[1]);
  const unit = (match[2] || 'gb').toLowerCase();
  if (unit === 'tb') return value * 1024;
  if (unit === 'mb') return value / 1024;
  return value;
}

export function sortStorageOptionsBySize(options = [], nameKey = 'name') {
  return [...options].sort(
    (a, b) => storageSizeInGb(a?.[nameKey]) - storageSizeInGb(b?.[nameKey]),
  );
}

export function resolveStorageStock(storageBridge, productStock = 0) {
  if (storageBridge && storageBridge.stockQuantity != null) {
    return Math.max(0, Number(storageBridge.stockQuantity) || 0);
  }
  return Math.max(0, Number(productStock) || 0);
}

export function resolveColorStock(colorBridge, productStock = 0) {
  if (colorBridge && colorBridge.stockQuantity != null) {
    return Math.max(0, Number(colorBridge.stockQuantity) || 0);
  }
  return Math.max(0, Number(productStock) || 0);
}

/**
 * Available stock for a selected color + storage combo.
 * Prefers ProductVariantStock (matrix cell). Falls back to min(color, storage).
 */
export function resolveVariantStock({
  variantBridge = null,
  colorBridge = null,
  storageBridge = null,
  productStock = 0,
} = {}) {
  if (variantBridge && variantBridge.stockQuantity != null) {
    return Math.max(0, Number(variantBridge.stockQuantity) || 0);
  }

  const storageStock = resolveStorageStock(storageBridge, productStock);
  if (!colorBridge) return storageStock;
  const colorStock = resolveColorStock(colorBridge, productStock);
  return Math.min(colorStock, storageStock);
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
  const variants = await tx.productVariantStock.findMany({
    where: { productId },
    select: { stockQuantity: true, colorId: true, storageOptionId: true },
  });

  if (variants.length > 0) {
    const total = sumVariantStocks(variants);
    const byColor = new Map();
    const byStorage = new Map();
    for (const row of variants) {
      byColor.set(
        row.colorId,
        (byColor.get(row.colorId) || 0) + Math.max(0, Number(row.stockQuantity) || 0),
      );
      byStorage.set(
        row.storageOptionId,
        (byStorage.get(row.storageOptionId) || 0) +
          Math.max(0, Number(row.stockQuantity) || 0),
      );
    }

    await Promise.all([
      tx.product.update({
        where: { id: productId },
        data: { stockQuantity: total },
      }),
      ...[...byColor.entries()].map(([colorId, stockQuantity]) =>
        tx.productColor.updateMany({
          where: { productId, colorId },
          data: { stockQuantity },
        }),
      ),
      ...[...byStorage.entries()].map(([storageOptionId, stockQuantity]) =>
        tx.productStorageOption.updateMany({
          where: { productId, storageOptionId },
          data: { stockQuantity },
        }),
      ),
    ]);

    return total;
  }

  const bridges = await tx.productStorageOption.findMany({
    where: { productId, isDeleted: false },
    select: { stockQuantity: true },
  });
  const total = sumStorageStocks(bridges);
  await tx.product.update({
    where: { id: productId },
    data: { stockQuantity: total },
  });
  return total;
}
