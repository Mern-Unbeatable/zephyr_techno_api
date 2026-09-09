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

/**
 * Matrix cell key: condition × colour × storage.
 * 2-arg form (legacy) → empty condition axis (`::colorId::storageOptionId`).
 * 3-arg form → `${conditionCategoryId || ''}::${colorId}::${storageOptionId}`.
 */
export function variantStockKey(colorId, storageOptionId, conditionCategoryId = null) {
  return `${conditionCategoryId || ''}::${colorId}::${storageOptionId}`;
}

export function parseVariantStockKey(key) {
  const parts = String(key ?? '').split('::');
  if (parts.length >= 3) {
    return {
      conditionKey: parts[0] ?? '',
      colorId: parts[1],
      storageOptionId: parts[2],
    };
  }
  return {
    conditionKey: '',
    colorId: parts[0],
    storageOptionId: parts[1],
  };
}

export function variantStockUniqueWhere(
  productId,
  colorId,
  storageOptionId,
  conditionCategoryId = null,
) {
  return {
    productId_conditionKey_colorId_storageOptionId: {
      productId,
      conditionKey: conditionCategoryId || '',
      colorId,
      storageOptionId,
    },
  };
}

export function storageSizeInGb(name) {
  const match = String(name || '')
    .trim()
    .match(/^(\d+(?:\.\d+)?)\s*((?:tb|gb|mb)*)\s*$/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const value = parseFloat(match[1]);
  const units = (match[2] || '').toLowerCase();
  if (units.includes('tb')) return value * 1024;
  if (units.includes('mb')) return value / 1024;
  return value;
}

/**
 * Normalize storage labels for display/storage: "256 GB" → "256GB".
 */
export function formatStorageLabel(name) {
  const raw = String(name ?? '')
    .trim()
    .replace(/(\d)\s+(gb|tb|mb)\b/gi, '$1$2');
  if (!raw || raw === '—') return raw;

  const match = raw.match(/^(\d+(?:\.\d+)?)\s*((?:tb|gb|mb)*)\s*$/i);
  if (!match) {
    const stripped = raw.replace(/\s*(gb|tb|mb)\s*/gi, '').trim();
    return stripped ? `${stripped}GB` : raw;
  }

  const value = match[1];
  const units = (match[2] || '').toLowerCase();
  if (units.includes('tb')) return `${value}TB`;
  if (units.includes('mb')) return `${value}MB`;
  return `${value}GB`;
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

export function sumConditionStocks(productConditions = []) {
  return productConditions.reduce(
    (total, entry) => total + Math.max(0, Number(entry?.stockQuantity) || 0),
    0,
  );
}

export function resolveConditionStock(conditionBridge, productStock = 0) {
  if (conditionBridge && conditionBridge.stockQuantity != null) {
    return Math.max(0, Number(conditionBridge.stockQuantity) || 0);
  }
  return Math.max(0, Number(productStock) || 0);
}

export function resolveConditionPrice(conditionBridge, productBasePrice = 0) {
  if (conditionBridge?.price != null && conditionBridge.price !== '') {
    return Math.max(0, Number(conditionBridge.price) || 0);
  }
  return Math.max(0, Number(productBasePrice) || 0);
}

export function minConditionPrice(productConditions = [], productBasePrice = 0) {
  if (!productConditions.length) {
    return Math.max(0, Number(productBasePrice) || 0);
  }

  const prices = productConditions
    .map((entry) => resolveConditionPrice(entry, productBasePrice))
    .filter((price) => price > 0);

  if (!prices.length) {
    return Math.max(0, Number(productBasePrice) || 0);
  }

  return Math.min(...prices);
}

/** Unit price from a Condition × Colour × Storage matrix cell. */
export function resolveMatrixPrice(cell, fallbackBasePrice = 0) {
  if (cell?.price != null && cell.price !== '') {
    return Math.max(0, Number(cell.price) || 0);
  }
  return Math.max(0, Number(fallbackBasePrice) || 0);
}

/** Stock from a matrix cell (0 when missing). */
export function resolveMatrixStock(cell) {
  if (cell && cell.stockQuantity != null) {
    return Math.max(0, Number(cell.stockQuantity) || 0);
  }
  return 0;
}

/** Lowest positive price across matrix cells (objects or Map values). */
export function minMatrixPrice(variantStocks = [], basePrice = 0) {
  const cells = Array.isArray(variantStocks)
    ? variantStocks
    : variantStocks instanceof Map
      ? [...variantStocks.values()]
      : [];

  if (!cells.length) {
    return Math.max(0, Number(basePrice) || 0);
  }

  const prices = cells
    .map((entry) => {
      if (entry == null) return 0;
      if (typeof entry === 'object') return resolveMatrixPrice(entry, 0);
      return Math.max(0, Number(entry) || 0);
    })
    .filter((price) => price > 0);

  if (!prices.length) {
    return Math.max(0, Number(basePrice) || 0);
  }

  return Math.min(...prices);
}

/**
 * Purchase stock for a cart/order line.
 * Prefers ProductVariantStock matrix cell when provided; otherwise condition
 * rollups (legacy) or colour × storage rules.
 */
export function resolvePurchaseStock({
  conditionBridge = null,
  hasConditions = false,
  variantBridge = null,
  colorBridge = null,
  storageBridge = null,
  productStock = 0,
} = {}) {
  if (variantBridge && variantBridge.stockQuantity != null) {
    return resolveMatrixStock(variantBridge);
  }
  if (hasConditions) {
    return resolveConditionStock(conditionBridge, productStock);
  }
  return resolveVariantStock({
    variantBridge,
    colorBridge,
    storageBridge,
    productStock,
  });
}

/**
 * Always sum ProductVariantStock when present; roll up ProductCondition,
 * ProductColor, and ProductStorageOption aggregates from the matrix.
 */
export async function syncProductStockTotal(tx, productId) {
  const variants = await tx.productVariantStock.findMany({
    where: { productId },
    select: {
      stockQuantity: true,
      colorId: true,
      storageOptionId: true,
      conditionCategoryId: true,
      conditionKey: true,
      price: true,
      compareAtPrice: true,
    },
  });

  if (variants.length > 0) {
    const total = sumVariantStocks(variants);
    const byColor = new Map();
    const byStorage = new Map();
    const byCondition = new Map();
    const storagePriceBuckets = new Map();

    for (const row of variants) {
      const qty = Math.max(0, Number(row.stockQuantity) || 0);
      byColor.set(row.colorId, (byColor.get(row.colorId) || 0) + qty);
      byStorage.set(
        row.storageOptionId,
        (byStorage.get(row.storageOptionId) || 0) + qty,
      );

      if (!storagePriceBuckets.has(row.storageOptionId)) {
        storagePriceBuckets.set(row.storageOptionId, {
          prices: [],
          compareAts: [],
        });
      }
      const storageBucket = storagePriceBuckets.get(row.storageOptionId);
      if (row.price != null && Number(row.price) > 0) {
        storageBucket.prices.push(Number(row.price));
      }
      if (row.compareAtPrice != null && Number(row.compareAtPrice) > 0) {
        storageBucket.compareAts.push(Number(row.compareAtPrice));
      }

      const categoryId = row.conditionCategoryId || (row.conditionKey || null);
      if (categoryId) {
        if (!byCondition.has(categoryId)) {
          byCondition.set(categoryId, {
            stock: 0,
            prices: [],
            compareAts: [],
          });
        }
        const bucket = byCondition.get(categoryId);
        bucket.stock += qty;
        if (row.price != null && Number(row.price) > 0) {
          bucket.prices.push(Number(row.price));
        }
        if (row.compareAtPrice != null && Number(row.compareAtPrice) > 0) {
          bucket.compareAts.push(Number(row.compareAtPrice));
        }
      }
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
      ...[...byStorage.entries()].map(([storageOptionId, stockQuantity]) => {
        const priceBucket = storagePriceBuckets.get(storageOptionId);
        const minPrice = priceBucket?.prices?.length
          ? Math.min(...priceBucket.prices)
          : undefined;
        const minCompare = priceBucket?.compareAts?.length
          ? Math.min(...priceBucket.compareAts)
          : null;
        return tx.productStorageOption.updateMany({
          where: { productId, storageOptionId },
          data: {
            stockQuantity,
            ...(minPrice != null ? { price: minPrice } : {}),
            compareAtPrice: minCompare,
          },
        });
      }),
      ...[...byCondition.entries()].map(([categoryId, bucket]) =>
        tx.productCondition.updateMany({
          where: { productId, categoryId },
          data: {
            stockQuantity: bucket.stock,
            ...(bucket.prices.length ? { price: Math.min(...bucket.prices) } : {}),
            compareAtPrice: bucket.compareAts.length
              ? Math.min(...bucket.compareAts)
              : null,
          },
        }),
      ),
    ]);

    return total;
  }

  const conditions = await tx.productCondition.findMany({
    where: { productId, isDeleted: false },
    select: { stockQuantity: true },
  });

  if (conditions.length > 0) {
    const total = sumConditionStocks(conditions);
    await tx.product.update({
      where: { id: productId },
      data: { stockQuantity: total },
    });
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
