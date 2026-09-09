import prisma from "../utils/prisma.js";
import AppError from "../utils/app-error.js";
import { buildImageUrl } from "../utils/url.js";
import {
  sumStorageStocks,
  sumVariantStocks,
  sumConditionStocks,
  minStoragePrice,
  minConditionPrice,
  minMatrixPrice,
  sortStorageOptionsBySize,
  variantStockKey,
  parseVariantStockKey,
  formatStorageLabel,
  syncProductStockTotal,
} from "../utils/stock.js";
import stockNotificationService from "./stock-notification.service.js";

class ProductService {
  #activeGalleryInclude = {
    where: { isDeleted: false },
    orderBy: { displayOrder: 'asc' },
  };

  // Nested relation includes bypass the soft-delete query extension, so filter explicitly.
  // Also exclude bridges whose related attribute was soft-deleted (orphans).
  #activeStorageInclude = {
    where: {
      isDeleted: false,
      storageOption: { isDeleted: false },
    },
  };

  #activeColorInclude = {
    where: {
      isDeleted: false,
      color: { isDeleted: false },
    },
  };

  #activeConditionInclude = {
    where: {
      isDeleted: false,
      category: { isDeleted: false },
    },
  };

  #transactionOptions = { timeout: 30000 };

  /**
   * Helper to format product images
   */
  #formatProductGallery(galleries) {
    if (!galleries) return [];
    return galleries.map((gallery) => ({
      id: gallery.id,
      imageUrl: buildImageUrl(gallery.imageUrl),
      displayOrder: gallery.displayOrder,
      colorId: gallery.colorId || null,
    }));
  }

  #parseStorageVariants(raw, storageIds, { fallbackStock = 0, fallbackPrice = null } = {}) {
    const allowed = new Set(storageIds || []);
    if (!storageIds?.length) {
      return new Map();
    }

    let entries = raw;
    if (entries === undefined || entries === null || entries === '') {
      return new Map(
        storageIds.map((id) => [
          id,
          {
            stockQuantity: Math.max(0, Number(fallbackStock) || 0),
            price:
              fallbackPrice != null && fallbackPrice !== ''
                ? Math.max(0, Number(fallbackPrice) || 0)
                : null,
            compareAtPrice: null,
          },
        ]),
      );
    }

    if (typeof entries === 'string') {
      entries = this.#parseJsonField(entries, 'storageStocks');
    }

    if (!Array.isArray(entries)) {
      throw new AppError(
        'Invalid storageStocks format. Must be a valid JSON array.',
        400,
      );
    }

    const variantMap = new Map();
    for (const entry of entries) {
      const storageOptionId = entry?.storageOptionId || entry?.id;
      if (!storageOptionId || !allowed.has(storageOptionId)) continue;

      const price =
        entry?.price !== undefined && entry?.price !== null && entry?.price !== ''
          ? Math.max(0, Number(entry.price) || 0)
          : fallbackPrice != null && fallbackPrice !== ''
            ? Math.max(0, Number(fallbackPrice) || 0)
            : null;

      const compareAt =
        entry?.compareAtPrice !== undefined &&
        entry?.compareAtPrice !== null &&
        entry?.compareAtPrice !== ''
          ? Math.max(0, Number(entry.compareAtPrice) || 0)
          : null;

      variantMap.set(storageOptionId, {
        stockQuantity: Math.max(0, parseInt(entry.stockQuantity, 10) || 0),
        price,
        compareAtPrice: compareAt && compareAt > 0 ? compareAt : null,
      });
    }

    for (const storageOptionId of storageIds) {
      if (!variantMap.has(storageOptionId)) {
        variantMap.set(storageOptionId, {
          stockQuantity: Math.max(0, Number(fallbackStock) || 0),
          price:
            fallbackPrice != null && fallbackPrice !== ''
              ? Math.max(0, Number(fallbackPrice) || 0)
              : null,
          compareAtPrice: null,
        });
      }
    }

    return variantMap;
  }

  #variantMapToRows(variantMap) {
    return [...variantMap.entries()].map(([storageOptionId, variant]) => ({
      storageOptionId,
      stockQuantity: variant.stockQuantity ?? 0,
      price: variant.price,
      compareAtPrice: variant.compareAtPrice ?? null,
    }));
  }

  #parseProductConditions(raw, categoryIds, { fallbackStock = 0, fallbackPrice = null } = {}) {
    const allowed = new Set(categoryIds || []);
    if (!categoryIds?.length) {
      return new Map();
    }

    let entries = raw;
    if (entries === undefined || entries === null || entries === '') {
      return new Map(
        categoryIds.map((id) => [
          id,
          {
            stockQuantity: Math.max(0, Number(fallbackStock) || 0),
            price:
              fallbackPrice != null && fallbackPrice !== ''
                ? Math.max(0, Number(fallbackPrice) || 0)
                : null,
            compareAtPrice: null,
          },
        ]),
      );
    }

    if (typeof entries === 'string') {
      entries = this.#parseJsonField(entries, 'conditionStocks');
    }

    if (!Array.isArray(entries)) {
      throw new AppError(
        'Invalid conditionStocks format. Must be a valid JSON array.',
        400,
      );
    }

    const variantMap = new Map();
    for (const entry of entries) {
      const categoryId = entry?.categoryId || entry?.id;
      if (!categoryId || !allowed.has(categoryId)) continue;

      const price =
        entry?.price !== undefined && entry?.price !== null && entry?.price !== ''
          ? Math.max(0, Number(entry.price) || 0)
          : fallbackPrice != null && fallbackPrice !== ''
            ? Math.max(0, Number(fallbackPrice) || 0)
            : null;

      const compareAt =
        entry?.compareAtPrice !== undefined &&
        entry?.compareAtPrice !== null &&
        entry?.compareAtPrice !== ''
          ? Math.max(0, Number(entry.compareAtPrice) || 0)
          : null;

      variantMap.set(categoryId, {
        stockQuantity: Math.max(0, parseInt(entry.stockQuantity, 10) || 0),
        price,
        compareAtPrice: compareAt && compareAt > 0 ? compareAt : null,
      });
    }

    for (const categoryId of categoryIds) {
      if (!variantMap.has(categoryId)) {
        variantMap.set(categoryId, {
          stockQuantity: Math.max(0, Number(fallbackStock) || 0),
          price:
            fallbackPrice != null && fallbackPrice !== ''
              ? Math.max(0, Number(fallbackPrice) || 0)
              : null,
          compareAtPrice: null,
        });
      }
    }

    return variantMap;
  }

  #conditionMapToRows(variantMap) {
    return [...variantMap.entries()].map(([categoryId, variant]) => ({
      categoryId,
      stockQuantity: variant.stockQuantity ?? 0,
      price: variant.price,
      compareAtPrice: variant.compareAtPrice ?? null,
    }));
  }

  #parseColorStocks(raw, colorIds, { fallbackStock = 0 } = {}) {
    const allowed = new Set(colorIds || []);
    if (!colorIds?.length) {
      return new Map();
    }

    let entries = raw;
    if (entries === undefined || entries === null || entries === '') {
      return new Map(
        colorIds.map((id) => [id, Math.max(0, Number(fallbackStock) || 0)]),
      );
    }

    if (typeof entries === 'string') {
      entries = this.#parseJsonField(entries, 'colorStocks');
    }

    if (!Array.isArray(entries)) {
      throw new AppError(
        'Invalid colorStocks format. Must be a valid JSON array.',
        400,
      );
    }

    const stockMap = new Map();
    for (const entry of entries) {
      const colorId = entry?.colorId || entry?.id;
      if (!colorId || !allowed.has(colorId)) continue;
      stockMap.set(colorId, Math.max(0, parseInt(entry.stockQuantity, 10) || 0));
    }

    for (const colorId of colorIds) {
      if (!stockMap.has(colorId)) {
        stockMap.set(colorId, Math.max(0, Number(fallbackStock) || 0));
      }
    }

    return stockMap;
  }

  /**
   * Parse condition × colour × storage matrix cells.
   * Returns Map keyed by variantStockKey(3) →
   * `{ stockQuantity, price, compareAtPrice, expressDeliveryEnabled }`.
   * When conditionCategoryIds is empty, uses conditionKey "".
   * Omits price on entries are seeded from conditionStocks / storageStocks when provided.
   */
  #parseVariantStocks(
    raw,
    colorIds,
    storageIds,
    conditionCategoryIds = [],
    {
      colorStockMap = null,
      storageVariantMap = null,
      conditionVariantMap = null,
    } = {},
  ) {
    const stockMap = new Map();
    if (!colorIds?.length || !storageIds?.length) {
      return stockMap;
    }

    const conditions =
      conditionCategoryIds?.length > 0 ? conditionCategoryIds : [null];

    let entries = raw;
    if (typeof entries === 'string') {
      entries = this.#parseJsonField(entries, 'variantStocks');
    }

    if (Array.isArray(entries)) {
      const colorSet = new Set(colorIds);
      const storageSet = new Set(storageIds);
      const conditionSet =
        conditionCategoryIds?.length > 0
          ? new Set(conditionCategoryIds)
          : null;

      for (const entry of entries) {
        const colorId = entry?.colorId;
        const storageOptionId = entry?.storageOptionId;
        const conditionCategoryId = entry?.conditionCategoryId || null;
        if (!colorId || !storageOptionId) continue;
        if (!colorSet.has(colorId) || !storageSet.has(storageOptionId)) continue;
        if (conditionSet) {
          if (!conditionCategoryId || !conditionSet.has(conditionCategoryId)) {
            continue;
          }
        } else if (conditionCategoryId) {
          continue;
        }

        const compareAt =
          entry?.compareAtPrice !== undefined &&
          entry?.compareAtPrice !== null &&
          entry?.compareAtPrice !== ''
            ? Math.max(0, Number(entry.compareAtPrice) || 0)
            : null;

        let price = null;
        if (
          entry?.price !== undefined &&
          entry?.price !== null &&
          entry?.price !== ''
        ) {
          price = Math.max(0, Number(entry.price) || 0);
        }

        let expressDeliveryEnabled = true;
        if (entry.expressDeliveryEnabled !== undefined) {
          expressDeliveryEnabled =
            entry.expressDeliveryEnabled === true ||
            entry.expressDeliveryEnabled === 'true' ||
            entry.expressDeliveryEnabled === 1 ||
            entry.expressDeliveryEnabled === '1';
        }

        stockMap.set(
          variantStockKey(colorId, storageOptionId, conditionCategoryId),
          {
            stockQuantity: Math.max(0, parseInt(entry.stockQuantity, 10) || 0),
            price,
            compareAtPrice: compareAt && compareAt > 0 ? compareAt : null,
            expressDeliveryEnabled,
          },
        );
      }
    } else if (raw !== undefined && raw !== null && raw !== '') {
      throw new AppError(
        'Invalid variantStocks format. Must be a valid JSON array.',
        400,
      );
    }

    const seedPrice = (conditionCategoryId, storageOptionId) => {
      const conditionPrice = conditionCategoryId
        ? conditionVariantMap?.get(conditionCategoryId)?.price
        : null;
      const storagePrice = storageVariantMap?.get(storageOptionId)?.price;
      return conditionPrice ?? storagePrice ?? null;
    };

    const seedCompareAt = (conditionCategoryId, storageOptionId) => {
      const conditionCompare = conditionCategoryId
        ? conditionVariantMap?.get(conditionCategoryId)?.compareAtPrice
        : null;
      const storageCompare =
        storageVariantMap?.get(storageOptionId)?.compareAtPrice;
      return conditionCompare ?? storageCompare ?? null;
    };

    const seedStock = (colorId, storageOptionId, conditionCategoryId) => {
      const colorStock = colorStockMap?.has(colorId)
        ? colorStockMap.get(colorId)
        : null;
      const storageStock =
        storageVariantMap?.get(storageOptionId)?.stockQuantity;
      const conditionStock = conditionCategoryId
        ? conditionVariantMap?.get(conditionCategoryId)?.stockQuantity
        : null;

      if (conditionStock != null && conditions.length > 0) {
        const cellCount = Math.max(colorIds.length * storageIds.length, 1);
        return Math.floor((Number(conditionStock) || 0) / cellCount);
      }
      if (colorStock != null && storageStock != null) {
        return Math.min(colorStock, storageStock);
      }
      if (storageStock != null && (colorStock == null || colorStock === 0)) {
        return Math.floor(
          (Number(storageStock) || 0) / Math.max(colorIds.length, 1),
        );
      }
      return Math.max(0, Number(colorStock) || 0);
    };

    for (const conditionCategoryId of conditions) {
      for (const colorId of colorIds) {
        for (const storageOptionId of storageIds) {
          const key = variantStockKey(
            colorId,
            storageOptionId,
            conditionCategoryId,
          );
          if (stockMap.has(key)) {
            const cell = stockMap.get(key);
            if (cell.price == null) {
              cell.price = seedPrice(conditionCategoryId, storageOptionId);
            }
            if (cell.compareAtPrice == null) {
              cell.compareAtPrice = seedCompareAt(
                conditionCategoryId,
                storageOptionId,
              );
            }
            continue;
          }

          stockMap.set(key, {
            stockQuantity: seedStock(
              colorId,
              storageOptionId,
              conditionCategoryId,
            ),
            price: seedPrice(conditionCategoryId, storageOptionId),
            compareAtPrice: seedCompareAt(
              conditionCategoryId,
              storageOptionId,
            ),
            expressDeliveryEnabled: true,
          });
        }
      }
    }

    return stockMap;
  }

  #aggregateVariantStockMap(stockMap) {
    const byColor = new Map();
    const byStorage = new Map();
    const byCondition = new Map();
    const storagePriceBuckets = new Map();
    let total = 0;

    for (const [key, value] of stockMap.entries()) {
      const cell =
        typeof value === 'object' && value != null
          ? value
          : { stockQuantity: value };
      const amount = Math.max(0, Number(cell.stockQuantity) || 0);
      total += amount;

      const { conditionKey, colorId, storageOptionId } =
        parseVariantStockKey(key);

      byColor.set(colorId, (byColor.get(colorId) || 0) + amount);
      byStorage.set(
        storageOptionId,
        (byStorage.get(storageOptionId) || 0) + amount,
      );

      if (!storagePriceBuckets.has(storageOptionId)) {
        storagePriceBuckets.set(storageOptionId, {
          prices: [],
          compareAts: [],
        });
      }
      const storageBucket = storagePriceBuckets.get(storageOptionId);
      if (cell.price != null && Number(cell.price) > 0) {
        storageBucket.prices.push(Number(cell.price));
      }
      if (cell.compareAtPrice != null && Number(cell.compareAtPrice) > 0) {
        storageBucket.compareAts.push(Number(cell.compareAtPrice));
      }

      if (conditionKey) {
        if (!byCondition.has(conditionKey)) {
          byCondition.set(conditionKey, {
            stockQuantity: 0,
            prices: [],
            compareAts: [],
          });
        }
        const bucket = byCondition.get(conditionKey);
        bucket.stockQuantity += amount;
        if (cell.price != null && Number(cell.price) > 0) {
          bucket.prices.push(Number(cell.price));
        }
        if (cell.compareAtPrice != null && Number(cell.compareAtPrice) > 0) {
          bucket.compareAts.push(Number(cell.compareAtPrice));
        }
      }
    }

    return { total, byColor, byStorage, byCondition, storagePriceBuckets };
  }

  #applyMatrixRollupsToBridges({
    colorIds = [],
    storageIds = [],
    conditionCategoryIds = [],
    colorStockMap = null,
    storageVariantMap = null,
    conditionVariantMap = null,
    byColor,
    byStorage,
    byCondition,
    storagePriceBuckets,
  }) {
    if (colorStockMap) {
      for (const colorId of colorIds) {
        colorStockMap.set(colorId, byColor.get(colorId) ?? 0);
      }
    }

    if (storageVariantMap) {
      for (const storageId of storageIds) {
        const current = storageVariantMap.get(storageId) || {
          stockQuantity: 0,
          price: null,
          compareAtPrice: null,
        };
        const priceBucket = storagePriceBuckets?.get(storageId);
        const minPrice = priceBucket?.prices?.length
          ? Math.min(...priceBucket.prices)
          : current.price;
        const minCompare = priceBucket?.compareAts?.length
          ? Math.min(...priceBucket.compareAts)
          : current.compareAtPrice ?? null;
        storageVariantMap.set(storageId, {
          ...current,
          stockQuantity: byStorage.get(storageId) ?? 0,
          price: minPrice ?? current.price,
          compareAtPrice: minCompare,
        });
      }
    }

    if (conditionVariantMap) {
      for (const categoryId of conditionCategoryIds) {
        const current = conditionVariantMap.get(categoryId) || {
          stockQuantity: 0,
          price: null,
          compareAtPrice: null,
        };
        const bucket = byCondition?.get(categoryId);
        conditionVariantMap.set(categoryId, {
          stockQuantity: bucket?.stockQuantity ?? 0,
          price: bucket?.prices?.length
            ? Math.min(...bucket.prices)
            : current.price,
          compareAtPrice: bucket?.compareAts?.length
            ? Math.min(...bucket.compareAts)
            : current.compareAtPrice ?? null,
        });
      }
    }
  }

  async #syncProductColorOptions(tx, productId, colorIds, stockMap) {
    const existing = await tx.productColor.findMany({
      where: { productId },
      includeDeleted: true,
      select: { id: true, colorId: true, stockQuantity: true },
    });
    const existingByColorId = new Map(existing.map((row) => [row.colorId, row]));
    const targetIds = new Set(colorIds);

    await Promise.all(
      existing
        .filter((row) => !targetIds.has(row.colorId))
        .map((row) => tx.productColor.delete({ where: { id: row.id } })),
    );

    await Promise.all(
      colorIds.map(async (colorId) => {
        const mappedStock = stockMap?.has(colorId)
          ? stockMap.get(colorId)
          : undefined;
        const current = existingByColorId.get(colorId);

        if (current) {
          await tx.productColor.update({
            where: { id: current.id },
            data: {
              stockQuantity:
                mappedStock !== undefined
                  ? mappedStock
                  : (current.stockQuantity ?? 0),
              isDeleted: false,
              deletedAt: null,
            },
          });
          return;
        }

        await tx.productColor.create({
          data: {
            productId,
            colorId,
            stockQuantity: mappedStock ?? 0,
          },
        });
      }),
    );
  }

  async #syncProductStorageOptions(tx, productId, storageIds, variantMap) {
    const existing = await tx.productStorageOption.findMany({
      where: { productId },
      includeDeleted: true,
      select: { id: true, storageOptionId: true },
    });
    const existingByStorageId = new Map(
      existing.map((row) => [row.storageOptionId, row]),
    );
    const targetIds = new Set(storageIds);

    await Promise.all(
      existing
        .filter((row) => !targetIds.has(row.storageOptionId))
        .map((row) => tx.productStorageOption.delete({ where: { id: row.id } })),
    );

    await Promise.all(
      storageIds.map(async (storageOptionId) => {
        const variant = variantMap.get(storageOptionId) ?? {
          stockQuantity: 0,
          price: null,
          compareAtPrice: null,
        };
        const current = existingByStorageId.get(storageOptionId);

        if (current) {
          await tx.productStorageOption.update({
            where: { id: current.id },
            data: {
              stockQuantity: variant.stockQuantity ?? 0,
              ...(variant.price != null ? { price: variant.price } : {}),
              compareAtPrice: variant.compareAtPrice ?? null,
              isDeleted: false,
              deletedAt: null,
            },
          });
          return;
        }

        await tx.productStorageOption.create({
          data: {
            productId,
            storageOptionId,
            stockQuantity: variant.stockQuantity ?? 0,
            ...(variant.price != null ? { price: variant.price } : {}),
            compareAtPrice: variant.compareAtPrice ?? null,
          },
        });
      }),
    );
  }

  async #syncProductConditions(tx, productId, categoryIds, variantMap) {
    const existing = await tx.productCondition.findMany({
      where: { productId },
      includeDeleted: true,
      select: { id: true, categoryId: true },
    });
    const existingByCategoryId = new Map(
      existing.map((row) => [row.categoryId, row]),
    );
    const targetIds = new Set(categoryIds);

    await Promise.all(
      existing
        .filter((row) => !targetIds.has(row.categoryId))
        .map((row) => tx.productCondition.delete({ where: { id: row.id } })),
    );

    await Promise.all(
      categoryIds.map(async (categoryId) => {
        const variant = variantMap.get(categoryId) ?? {
          stockQuantity: 0,
          price: null,
          compareAtPrice: null,
        };
        const current = existingByCategoryId.get(categoryId);

        if (current) {
          await tx.productCondition.update({
            where: { id: current.id },
            data: {
              stockQuantity: variant.stockQuantity ?? 0,
              ...(variant.price != null ? { price: variant.price } : {}),
              compareAtPrice: variant.compareAtPrice ?? null,
              isDeleted: false,
              deletedAt: null,
            },
          });
          return;
        }

        await tx.productCondition.create({
          data: {
            productId,
            categoryId,
            stockQuantity: variant.stockQuantity ?? 0,
            price: variant.price ?? 0,
            compareAtPrice: variant.compareAtPrice ?? null,
          },
        });
      }),
    );
  }

  async #syncProductVariantStocks(
    tx,
    productId,
    colorIds,
    storageIds,
    conditionCategoryIds,
    stockMap,
  ) {
    const conditions =
      conditionCategoryIds?.length > 0 ? conditionCategoryIds : [null];

    const existing = await tx.productVariantStock.findMany({
      where: { productId },
      select: {
        id: true,
        colorId: true,
        storageOptionId: true,
        conditionCategoryId: true,
        conditionKey: true,
        stockQuantity: true,
        expressDeliveryEnabled: true,
      },
    });

    const existingByKey = new Map(
      existing.map((row) => [
        variantStockKey(
          row.colorId,
          row.storageOptionId,
          row.conditionCategoryId,
        ),
        row,
      ]),
    );

    const targetKeys = new Set();
    for (const conditionCategoryId of conditions) {
      for (const colorId of colorIds) {
        for (const storageOptionId of storageIds) {
          targetKeys.add(
            variantStockKey(colorId, storageOptionId, conditionCategoryId),
          );
        }
      }
    }

    await Promise.all(
      existing
        .filter(
          (row) =>
            !targetKeys.has(
              variantStockKey(
                row.colorId,
                row.storageOptionId,
                row.conditionCategoryId,
              ),
            ),
        )
        .map((row) => tx.productVariantStock.delete({ where: { id: row.id } })),
    );

    const restockedVariants = [];

    await Promise.all(
      conditions.flatMap((conditionCategoryId) =>
        colorIds.flatMap((colorId) =>
          storageIds.map(async (storageOptionId) => {
            const key = variantStockKey(
              colorId,
              storageOptionId,
              conditionCategoryId,
            );
            const cell = stockMap.get(key) || {
              stockQuantity: 0,
              price: null,
              compareAtPrice: null,
              expressDeliveryEnabled: true,
            };
            const stockQuantity = Math.max(0, Number(cell.stockQuantity) || 0);
            const current = existingByKey.get(key);
            const previousStock = current
              ? Number(current.stockQuantity) || 0
              : 0;
            const conditionKey = conditionCategoryId || '';
            const expressDeliveryEnabled =
              cell.expressDeliveryEnabled !== undefined
                ? Boolean(cell.expressDeliveryEnabled)
                : current?.expressDeliveryEnabled !== false;

            const data = {
              stockQuantity,
              price: cell.price ?? null,
              compareAtPrice: cell.compareAtPrice ?? null,
              expressDeliveryEnabled,
              conditionCategoryId: conditionCategoryId || null,
              conditionKey,
            };

            if (current) {
              await tx.productVariantStock.update({
                where: { id: current.id },
                data,
              });
            } else {
              await tx.productVariantStock.create({
                data: {
                  productId,
                  colorId,
                  storageOptionId,
                  ...data,
                },
              });
            }

            if (previousStock <= 0 && stockQuantity > 0) {
              restockedVariants.push({
                colorId,
                storageOptionId,
                conditionCategoryId: conditionCategoryId || null,
              });
            }
          }),
        ),
      ),
    );

    return restockedVariants;
  }

  #parseJsonField(val, fieldName) {
    if (val === undefined || val === null || val === '') return null;
    if (Array.isArray(val)) return val;
    try {
      return JSON.parse(val);
    } catch {
      throw new AppError(`Invalid ${fieldName} format. Must be a valid JSON array.`, 400);
    }
  }

  #buildGalleriesFromUploads(files, imageMeta, allowedColorIds = []) {
    if (!files || files.length === 0) return [];

    const meta = imageMeta
      ? this.#parseJsonField(imageMeta, 'imageMeta')
      : files.map((_, index) => ({ colorId: null, displayOrder: index }));

    if (!Array.isArray(meta)) {
      throw new AppError('Invalid imageMeta format. Must be a valid JSON array.', 400);
    }

    if (meta.length !== files.length) {
      throw new AppError('imageMeta length must match the number of uploaded images.', 400);
    }

    const allowed = new Set(allowedColorIds);

    return files.map((file, index) => {
      const entry = meta[index] || {};
      const colorId = entry.colorId || null;

      if (colorId && !allowed.has(colorId)) {
        throw new AppError('Image colorId must match a selected product color.', 400);
      }

      return {
        imageUrl: file.path.replace(/\\/g, '/'),
        colorId,
        displayOrder: Number.isFinite(entry.displayOrder) ? entry.displayOrder : index,
      };
    });
  }

  #toNestedGalleryCreate({ imageUrl, colorId, displayOrder }) {
    return {
      imageUrl,
      displayOrder,
      ...(colorId ? { color: { connect: { id: colorId } } } : {}),
    };
  }

  /**
   * Master formatter: transforms raw Prisma product into a clean frontend-friendly shape.
   * - Extracts available options from bridge tables
   * - Removes internal soft-delete fields
   * - Formats image URLs
   */
  #formatProduct(product) {
    const availableColorIds = new Set(
      (product.colors || []).map((pc) => pc.color.id),
    );
    const galleries = (product.productGalleries || []).filter(
      (gallery) => !gallery.colorId || availableColorIds.has(gallery.colorId),
    );
    const conditions = product.productConditions || [];
    const stockQuantity =
      sumVariantStocks(product.variantStocks) ||
      sumConditionStocks(conditions) ||
      sumStorageStocks(product.storageOptions) ||
      product.stockQuantity ||
      0;

    return {
      id: product.id,
      title: product.title,
      description: product.description,
      introduction: product.introduction,
      basePrice: product.basePrice,
      compareAtPrice:
        product.compareAtPrice != null ? parseFloat(product.compareAtPrice) : null,
      stockQuantity,
      listingStatus: product.listingStatus,
      isFeatured: Boolean(product.isFeatured || false),
      featuredAt: product.featuredAt || null,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,

      // Relations - clean, no soft-delete fields
      category: product.category
        ? { id: product.category.id, name: product.category.name }
        : null,
      series: product.series
        ? { id: product.series.id, name: product.series.name }
        : null,
      deviceModel: product.deviceModel
        ? { id: product.deviceModel.id, name: product.deviceModel.name }
        : null,
      condition: product.condition
        ? { id: product.condition.id, name: product.condition.name }
        : null,

      // Images with full URLs (exclude images for colors no longer on the product)
      images: this.#formatProductGallery(galleries),

      // FAQs - clean
      faqs: (product.productFaqs || [])
        .slice()
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
        .map((f) => ({
          id: f.id,
          question: f.question,
          answer: f.answer,
          displayOrder: f.displayOrder ?? 0,
        })),

      // Highlights & Specifications
      highlights: (product.highlights || []).map((h) => ({
        id: h.id,
        title: h.title,
        description: h.description,
        iconUrl: h.iconUrl,
        displayOrder: h.displayOrder,
      })),
      specifications: (product.specifications || []).map((s) => ({
        id: s.id,
        name: s.name,
        value: s.value,
        displayOrder: s.displayOrder,
      })),
      includedItems: (product.includedItems || []).map((item) => ({
        id: item.id,
        label: item.label,
        displayOrder: item.displayOrder,
      })),

      // Available options from bridge tables
      availableColors: (product.colors || []).map((pc) => ({
        id: pc.color.id,
        name: pc.color.name,
        hexCode: pc.color.hexCode || null,
        stockQuantity: pc.stockQuantity ?? 0,
      })),
      availableStorageOptions: sortStorageOptionsBySize(
        (product.storageOptions || []).map((ps) => ({
          id: ps.storageOption.id,
          name: formatStorageLabel(ps.storageOption.name),
          stockQuantity: ps.stockQuantity ?? 0,
          price:
            ps.price != null
              ? parseFloat(ps.price)
              : parseFloat(product.basePrice),
          compareAtPrice:
            ps.compareAtPrice != null
              ? parseFloat(ps.compareAtPrice)
              : product.compareAtPrice != null
                ? parseFloat(product.compareAtPrice)
                : null,
        })),
      ),
      availableConditions: conditions.map((pc) => ({
        id: pc.category?.id || pc.categoryId,
        name: pc.category?.name || null,
        stockQuantity: pc.stockQuantity ?? 0,
        price: pc.price != null ? parseFloat(pc.price) : parseFloat(product.basePrice),
        compareAtPrice:
          pc.compareAtPrice != null
            ? parseFloat(pc.compareAtPrice)
            : product.compareAtPrice != null
              ? parseFloat(product.compareAtPrice)
              : null,
      })),
      availableVariantStocks: (product.variantStocks || []).map((vs) => ({
        conditionCategoryId: vs.conditionCategoryId || null,
        colorId: vs.colorId,
        storageOptionId: vs.storageOptionId,
        stockQuantity: vs.stockQuantity ?? 0,
        price: vs.price != null ? parseFloat(vs.price) : null,
        compareAtPrice:
          vs.compareAtPrice != null ? parseFloat(vs.compareAtPrice) : null,
        expressDeliveryEnabled: vs.expressDeliveryEnabled !== false,
      })),
    };
  }

  /**
   * Lightweight formatter for list/card views (admin product grid).
   * Returns only what is needed to render a product card.
   */
  #formatProductCard(product) {
    // First image as thumbnail; also build per-colour thumbs from gallery
    const galleries = product.productGalleries || [];
    const thumbnail = galleries[0]
      ? buildImageUrl(galleries[0].imageUrl)
      : null;

    const colorThumbnails = [];
    const seenColorThumbs = new Set();
    for (const gallery of galleries) {
      if (!gallery.colorId || seenColorThumbs.has(gallery.colorId)) continue;
      seenColorThumbs.add(gallery.colorId);
      colorThumbnails.push({
        colorId: gallery.colorId,
        imageUrl: buildImageUrl(gallery.imageUrl),
      });
    }

    const productRrp =
      product.compareAtPrice != null ? parseFloat(product.compareAtPrice) : null;
    const conditions = product.productConditions || [];
    const storages = product.storageOptions || [];

    let compareAtPrice = null;
    if (conditions.length) {
      const pricedConditions = conditions.filter(
        (row) => row.price != null && Number(row.price) > 0,
      );
      const cheapestCondition = pricedConditions.length
        ? pricedConditions.reduce((lowest, row) =>
            Number(row.price) < Number(lowest.price) ? row : lowest,
          )
        : null;
      const conditionRrp =
        cheapestCondition?.compareAtPrice != null
          ? parseFloat(cheapestCondition.compareAtPrice)
          : null;
      compareAtPrice =
        conditionRrp > 0 ? conditionRrp : productRrp > 0 ? productRrp : null;
    } else {
      const pricedStorages = storages.filter(
        (row) => row.price != null && Number(row.price) > 0,
      );
      const cheapestStorage = pricedStorages.length
        ? pricedStorages.reduce((lowest, row) =>
            Number(row.price) < Number(lowest.price) ? row : lowest,
          )
        : null;
      const storageRrp =
        cheapestStorage?.compareAtPrice != null
          ? parseFloat(cheapestStorage.compareAtPrice)
          : null;
      compareAtPrice =
        storageRrp > 0 ? storageRrp : productRrp > 0 ? productRrp : null;
    }

    const stockQuantity =
      sumVariantStocks(product.variantStocks) ||
      sumConditionStocks(conditions) ||
      sumStorageStocks(product.storageOptions) ||
      product.stockQuantity ||
      0;

    return {
      id: product.id,
      title: product.title,
      basePrice: product.basePrice,
      compareAtPrice,
      stockQuantity,
      listingStatus: product.listingStatus,
      thumbnail,
      colorThumbnails,
      category: product.category
        ? { id: product.category.id, name: product.category.name }
        : null,
      series: product.series
        ? { id: product.series.id, name: product.series.name }
        : null,
      deviceModel: product.deviceModel
        ? { id: product.deviceModel.id, name: product.deviceModel.name }
        : null,
      condition: product.condition
        ? { id: product.condition.id, name: product.condition.name }
        : null,
      isFeatured: Boolean(product.isFeatured || false),
      featuredAt: product.featuredAt || null,
      createdAt: product.createdAt,
      colorIds: (product.colors || []).map((pc) => pc.colorId),
      storageOptionIds: (product.storageOptions || []).map((ps) => ps.storageOptionId),
      conditionCategoryIds: conditions.map((pc) => pc.categoryId || pc.category?.id),
      availableColors: (product.colors || [])
        .map((pc) => pc.color)
        .filter(Boolean)
        .map((color) => ({
          id: color.id,
          name: color.name,
          hexCode: color.hexCode || null,
        })),
      availableStorageOptions: sortStorageOptionsBySize(
        (product.storageOptions || [])
          .map((ps) => ({
            id: ps.storageOption?.id,
            name: formatStorageLabel(ps.storageOption?.name),
            price:
              ps.price != null
                ? parseFloat(ps.price)
                : product.basePrice != null
                  ? parseFloat(product.basePrice)
                  : null,
            compareAtPrice:
              ps.compareAtPrice != null
                ? parseFloat(ps.compareAtPrice)
                : productRrp > 0
                  ? productRrp
                  : null,
          }))
          .filter((storage) => storage.id && storage.name),
        'name',
      ),
      availableConditions: conditions.map((pc) => ({
        id: pc.category?.id || pc.categoryId,
        name: pc.category?.name || null,
        stockQuantity: pc.stockQuantity ?? 0,
        price: pc.price != null ? parseFloat(pc.price) : parseFloat(product.basePrice),
        compareAtPrice:
          pc.compareAtPrice != null
            ? parseFloat(pc.compareAtPrice)
            : productRrp > 0
              ? productRrp
              : null,
      })),
      availableVariantStocks: (product.variantStocks || []).map((vs) => ({
        conditionCategoryId: vs.conditionCategoryId || null,
        colorId: vs.colorId,
        storageOptionId: vs.storageOptionId,
        stockQuantity: vs.stockQuantity ?? 0,
        price: vs.price != null ? parseFloat(vs.price) : null,
        compareAtPrice:
          vs.compareAtPrice != null ? parseFloat(vs.compareAtPrice) : null,
        expressDeliveryEnabled:
          vs.expressDeliveryEnabled !== undefined
            ? Boolean(vs.expressDeliveryEnabled)
            : true,
      })),
    };
  }

  /**
   * Create a new Product
   */
  async createProduct(data, files) {
    const {
      title,
      introduction,
      basePrice,
      stockQuantity,
      listingStatus,
      categoryId,
      seriesId,
      deviceModelId,
      conditionId,
      faqs,
      highlights,
      specifications,
      includedItems,
      colorIds,
      storageOptionIds,
    } = data;

    // Use introduction as description since the UI only provides Introduction
    const description = data.description || introduction || title;

    // Validate required fields (conditionId is optional — listings are category-only)
    if (
      !title ||
      !categoryId ||
      !seriesId ||
      !deviceModelId
    ) {
      throw new AppError(
        "Missing required product fields (title, categoryId, seriesId, deviceModelId)",
        400,
      );
    }

    // Validate category
    const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true, name: true } });
    if (!category) throw new AppError('Invalid category ID.', 400);

    // Product listings use Category only — condition is reserved for Sell Your Phone.
    // Keep optional accept for legacy payloads, but never require it.
    let resolvedConditionId = null;
    if (conditionId) {
      const condition = await prisma.condition.findUnique({
        where: { id: conditionId },
        select: { id: true },
      });
      if (!condition) throw new AppError('Invalid condition ID.', 400);
      resolvedConditionId = conditionId;
    }

    // Process uploaded images after colorIds are parsed (see below)
    let productGalleries = [];

    // Process FAQs (usually sent as JSON string in form-data)
    let productFaqs = [];
    if (faqs) {
      try {
        const parsedFaqs = typeof faqs === "string" ? JSON.parse(faqs) : faqs;
        if (Array.isArray(parsedFaqs)) {
          productFaqs = parsedFaqs.map((faq, index) => ({
            question: faq.question,
            answer: faq.answer,
            displayOrder:
              Number.isFinite(Number(faq.displayOrder))
                ? Number(faq.displayOrder)
                : index,
          }));
        }
      } catch (err) {
        throw new AppError(
          "Invalid FAQs format. Must be a valid JSON array.",
          400,
        );
      }
    }

    // Process Highlights
    let productHighlights = [];
    if (highlights) {
      try {
        const parsedHighlights = typeof highlights === "string" ? JSON.parse(highlights) : highlights;
        if (Array.isArray(parsedHighlights)) {
          productHighlights = parsedHighlights.map((h) => ({
            title: h.title,
            description: h.description,
            iconUrl: h.iconUrl || null,
            displayOrder: h.displayOrder || 0,
          }));
        }
      } catch (err) {
        throw new AppError(
          "Invalid Highlights format. Must be a valid JSON array.",
          400,
        );
      }
    }

    // Process Specifications
    let productSpecifications = [];
    if (specifications) {
      try {
        const parsedSpecs = typeof specifications === "string" ? JSON.parse(specifications) : specifications;
        if (Array.isArray(parsedSpecs)) {
          productSpecifications = parsedSpecs.map((s) => ({
            name: s.name,
            value: s.value,
            displayOrder: s.displayOrder || 0,
          }));
        }
      } catch (err) {
        throw new AppError(
          "Invalid Specifications format. Must be a valid JSON array.",
          400,
        );
      }
    }

    // Helper to safely parse JSON arrays from form-data
    const parseArray = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      try {
        return JSON.parse(val);
      } catch (e) {
        throw new AppError(`Invalid array format: ${val}`, 400);
      }
    };

    const colors = parseArray(colorIds);
    const storages = parseArray(storageOptionIds);
    const conditionCategoryIds = parseArray(data.conditionCategoryIds);

    if (colors.length === 0 || storages.length === 0) {
      throw new AppError(
        "At least one Color and Storage Option must be selected.",
        400,
      );
    }

    if (conditionCategoryIds.length > 0) {
      const conditionCategories = await prisma.category.findMany({
        where: { id: { in: conditionCategoryIds } },
        select: { id: true },
      });
      if (conditionCategories.length !== conditionCategoryIds.length) {
        throw new AppError('One or more condition category IDs are invalid.', 400);
      }
    }

    if (files && files.length > 0) {
      productGalleries = this.#buildGalleriesFromUploads(
        files,
        data.imageMeta,
        colors,
      );
    }

    // Process Included Items (What's Included)
    let productIncludedItems = [];
    if (includedItems) {
      try {
        const parsedIncluded =
          typeof includedItems === 'string' ? JSON.parse(includedItems) : includedItems;
        if (Array.isArray(parsedIncluded)) {
          productIncludedItems = parsedIncluded
            .filter((item) => item?.label?.trim())
            .map((item, index) => ({
              label: item.label.trim(),
              displayOrder: Number.isFinite(item.displayOrder) ? item.displayOrder : index,
            }));
        }
      } catch (err) {
        throw new AppError(
          'Invalid includedItems format. Must be a valid JSON array.',
          400,
        );
      }
    }

    const parsedStock = parseInt(stockQuantity, 10) || 0;
    const parsedPrice =
      basePrice !== undefined && basePrice !== null && basePrice !== ''
        ? Number(basePrice)
        : null;
    const storageVariantMap = this.#parseStorageVariants(
      data.storageStocks,
      storages,
      { fallbackStock: parsedStock, fallbackPrice: parsedPrice },
    );
    const conditionVariantMap = this.#parseProductConditions(
      data.conditionStocks,
      conditionCategoryIds,
      { fallbackStock: parsedStock, fallbackPrice: parsedPrice },
    );
    const colorStockMap = this.#parseColorStocks(data.colorStocks, colors, {
      fallbackStock: parsedStock,
    });
    const variantStockMap = this.#parseVariantStocks(
      data.variantStocks,
      colors,
      storages,
      conditionCategoryIds,
      { colorStockMap, storageVariantMap, conditionVariantMap },
    );
    const {
      total: totalStock,
      byColor,
      byStorage,
      byCondition,
      storagePriceBuckets,
    } = this.#aggregateVariantStockMap(variantStockMap);

    this.#applyMatrixRollupsToBridges({
      colorIds: colors,
      storageIds: storages,
      conditionCategoryIds,
      colorStockMap,
      storageVariantMap,
      conditionVariantMap,
      byColor,
      byStorage,
      byCondition,
      storagePriceBuckets,
    });

    const storageVariantRows = this.#variantMapToRows(storageVariantMap);
    const conditionRows = this.#conditionMapToRows(conditionVariantMap);
    const hasConditions = conditionCategoryIds.length > 0;
    const productTotalStock =
      colors.length && storages.length
        ? totalStock
        : hasConditions
          ? sumConditionStocks(conditionRows)
          : sumStorageStocks(storageVariantRows);
    const productBasePrice =
      colors.length && storages.length
        ? minMatrixPrice(variantStockMap, parsedPrice)
        : hasConditions
          ? minConditionPrice(conditionRows, parsedPrice)
          : minStoragePrice(storageVariantRows, parsedPrice);

    if (!storages.length && !hasConditions && (parsedPrice == null || Number.isNaN(parsedPrice))) {
      throw new AppError(
        'Missing required product fields (title, basePrice, categoryId, seriesId, deviceModelId)',
        400,
      );
    }

    if (colors.length && storages.length) {
      const missingPrices = [...variantStockMap.values()].filter(
        (cell) => !cell?.price || cell.price <= 0,
      );
      if (missingPrices.length > 0) {
        throw new AppError(
          'Each variant (condition × colour × storage) must have a price greater than 0.',
          400,
        );
      }
    } else if (hasConditions) {
      const missingPrices = conditionCategoryIds.filter((categoryId) => {
        const variant = conditionVariantMap.get(categoryId);
        return !variant?.price || variant.price <= 0;
      });
      if (missingPrices.length > 0) {
        throw new AppError(
          'Each selected condition must have a price greater than 0.',
          400,
        );
      }
    } else if (storages.length) {
      const missingPrices = storages.filter((storageId) => {
        const variant = storageVariantMap.get(storageId);
        return !variant?.price || variant.price <= 0;
      });
      if (missingPrices.length > 0) {
        throw new AppError(
          'Each selected storage option must have a price greater than 0.',
          400,
        );
      }
    } else if (parsedPrice == null || Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      throw new AppError('basePrice must be a positive number.', 400);
    }

    // Create product with bridge records in a transaction
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          title,
          description,
          introduction,
          basePrice: productBasePrice,
          compareAtPrice:
            data.compareAtPrice !== undefined &&
            data.compareAtPrice !== null &&
            data.compareAtPrice !== ''
              ? Number(data.compareAtPrice) || null
              : null,
          stockQuantity: productTotalStock,
          listingStatus: listingStatus || "INACTIVE",
          categoryId,
          seriesId,
          deviceModelId,
          ...(resolvedConditionId ? { conditionId: resolvedConditionId } : {}),
          productGalleries: {
            create: productGalleries.map((gallery) =>
              this.#toNestedGalleryCreate(gallery),
            ),
          },
          productFaqs: { create: productFaqs },
          highlights: { create: productHighlights },
          specifications: { create: productSpecifications },
          includedItems: { create: productIncludedItems },
          // Create bridge records for options
          colors: {
            create: colors.map((colorId) => ({
              colorId,
              stockQuantity: colorStockMap.get(colorId) ?? 0,
            })),
          },
          storageOptions: {
            create: storages.map((storageId) => {
              const variant = storageVariantMap.get(storageId) ?? {
                stockQuantity: 0,
                price: productBasePrice,
              };
              return {
                storageOptionId: storageId,
                stockQuantity: variant.stockQuantity ?? 0,
                price: variant.price ?? productBasePrice,
                compareAtPrice: variant.compareAtPrice ?? null,
              };
            }),
          },
          ...(hasConditions
            ? {
                productConditions: {
                  create: conditionCategoryIds.map((conditionCategoryId) => {
                    const variant = conditionVariantMap.get(conditionCategoryId) ?? {
                      stockQuantity: 0,
                      price: productBasePrice,
                    };
                    return {
                      categoryId: conditionCategoryId,
                      stockQuantity: variant.stockQuantity ?? 0,
                      price: variant.price ?? productBasePrice,
                      compareAtPrice: variant.compareAtPrice ?? null,
                    };
                  }),
                },
              }
            : {}),
          ...(colors.length && storages.length
            ? {
                variantStocks: {
                  create: [...variantStockMap.entries()].map(([key, cell]) => {
                    const { conditionKey, colorId, storageOptionId } =
                      parseVariantStockKey(key);
                    return {
                      colorId,
                      storageOptionId,
                      conditionKey: conditionKey || '',
                      conditionCategoryId: conditionKey || null,
                      stockQuantity: cell.stockQuantity ?? 0,
                      price: cell.price ?? null,
                      compareAtPrice: cell.compareAtPrice ?? null,
                      expressDeliveryEnabled:
                        cell.expressDeliveryEnabled !== false,
                    };
                  }),
                },
              }
            : {}),
        },
        select: {
          id: true,
        },
      });

      return created;
    });

    return product;
  }

  /**
   * Get all products with optional filters
   */
  async getAllProducts(query) {
    // Supported filters: categoryId, seriesId, deviceModelId, conditionId,
    // colorId, storageOptionId, priceMin, priceMax, search,
    // listingStatus, isFeatured
    // Pagination: page, limit
    const {
      categoryId,
      seriesId,
      deviceModelId,
      conditionId,
      colorId,
      storageOptionId,
      priceMin,
      priceMax,
      search,
      listingStatus,
      isFeatured,
      page = 1,
      limit = 24,
      sortBy,
    } = query;

    const where = {};
    if (listingStatus) where.listingStatus = listingStatus;
    if (conditionId) where.conditionId = conditionId;
    if (categoryId) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            { categoryId },
            {
              productConditions: {
                some: { categoryId, isDeleted: false },
              },
            },
          ],
        },
      ];
    }
    if (seriesId) where.seriesId = seriesId;
    if (deviceModelId) where.deviceModelId = deviceModelId;
    if (isFeatured !== undefined) where.isFeatured = isFeatured === 'true' || isFeatured === true;
    if (priceMin !== undefined || priceMax !== undefined) {
      where.basePrice = {};
      if (priceMin !== undefined) where.basePrice.gte = Number(priceMin);
      if (priceMax !== undefined) where.basePrice.lte = Number(priceMax);
    }
    if (search) {
      const term = String(search).trim();
      const nameFilter = { contains: term, mode: 'insensitive' };

      // Resolve attribute matches first so "128", "Black", "iPhone 15 Pro" find products
      // via their color / storage / model / series relations — not title text alone.
      const [matchedColors, matchedStorages, matchedModels, matchedSeries] =
        await Promise.all([
          prisma.color.findMany({
            where: { name: nameFilter },
            select: { id: true },
          }),
          prisma.storageOption.findMany({
            where: { name: nameFilter },
            select: { id: true },
          }),
          prisma.deviceModel.findMany({
            where: { name: nameFilter },
            select: { id: true },
          }),
          prisma.series.findMany({
            where: { name: nameFilter },
            select: { id: true },
          }),
        ]);

      const or = [
        { title: nameFilter },
        { description: nameFilter },
      ];

      if (matchedModels.length) {
        or.push({ deviceModelId: { in: matchedModels.map((m) => m.id) } });
      }
      if (matchedSeries.length) {
        or.push({ seriesId: { in: matchedSeries.map((s) => s.id) } });
      }
      if (matchedColors.length) {
        or.push({
          colors: {
            some: {
              isDeleted: false,
              colorId: { in: matchedColors.map((c) => c.id) },
            },
          },
        });
      }
      if (matchedStorages.length) {
        or.push({
          storageOptions: {
            some: {
              isDeleted: false,
              storageOptionId: { in: matchedStorages.map((s) => s.id) },
            },
          },
        });
      }

      where.OR = or;
    }

    // Build relation filters for options
    if (colorId) where.colors = { some: { colorId } };
    if (storageOptionId) where.storageOptions = { some: { storageOptionId } };

    // Home Featured section uses sortBy=featured (featured products only).
    // Shop dropdown uses featuredFirst (all products, featured ones sorted to the top).
    if (sortBy === 'featured') {
      where.isFeatured = true;
    }

    const take = Math.min(Number(limit) || 24, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const orderBy = [];
    if (sortBy === 'priceAsc') orderBy.push({ basePrice: 'asc' });
    else if (sortBy === 'priceDesc') orderBy.push({ basePrice: 'desc' });
    else if (sortBy === 'featured' || sortBy === 'featuredFirst') {
      orderBy.push({ isFeatured: 'desc' });
      orderBy.push({ featuredAt: 'desc' });
    } else if (sortBy === 'newest') orderBy.push({ createdAt: 'desc' });
    // Default / All: newest first
    if (sortBy !== 'newest') orderBy.push({ createdAt: 'desc' });

    // Count total and fetch page in parallel — eliminates a sequential DB round-trip
    const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      skip,
      take,
      orderBy,
      select: {
        id: true,
        title: true,
        basePrice: true,
        compareAtPrice: true,
        stockQuantity: true,
        listingStatus: true,
        isFeatured: true,
        featuredAt: true,
        createdAt: true,
        category: { select: { id: true, name: true } },
        series: { select: { id: true, name: true } },
        deviceModel: { select: { id: true, name: true } },
        condition: { select: { id: true, name: true } },
        productGalleries: {
          ...this.#activeGalleryInclude,
          select: {
            imageUrl: true,
            colorId: true,
            displayOrder: true,
          },
          orderBy: { displayOrder: 'asc' },
        },
        colors: {
          ...this.#activeColorInclude,
          select: {
            colorId: true,
            color: { select: { id: true, name: true, hexCode: true } },
          },
        },
        storageOptions: {
          ...this.#activeStorageInclude,
          select: {
            storageOptionId: true,
            stockQuantity: true,
            price: true,
            compareAtPrice: true,
            storageOption: { select: { id: true, name: true } },
          },
        },
        productConditions: {
          ...this.#activeConditionInclude,
          select: {
            categoryId: true,
            stockQuantity: true,
            price: true,
            compareAtPrice: true,
            category: { select: { id: true, name: true } },
          },
        },
        variantStocks: {
          select: {
            conditionCategoryId: true,
            colorId: true,
            storageOptionId: true,
            stockQuantity: true,
            price: true,
            compareAtPrice: true,
            expressDeliveryEnabled: true,
          },
        },
      },
    }),
    ]);

    const items = products.map((p) => this.#formatProductCard(p));
    return {
      meta: { total, page: Number(page), limit: take, totalPages: Math.ceil(total / take) },
      items,
    };
  }

  /**
   * Get product by ID
   */
  async getProductById(id, includeRelated = false) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        series: { select: { id: true, name: true } },
        deviceModel: { select: { id: true, name: true } },
        condition: { select: { id: true, name: true } },
        productGalleries: this.#activeGalleryInclude,
        productFaqs: true,
        highlights: true,
        specifications: true,
        includedItems: { orderBy: { displayOrder: 'asc' } },
        colors: {
          ...this.#activeColorInclude,
          select: {
            stockQuantity: true,
            color: { select: { id: true, name: true, hexCode: true } },
          },
        },
        storageOptions: {
          ...this.#activeStorageInclude,
          include: {
            storageOption: { select: { id: true, name: true } },
          },
        },
        productConditions: {
          ...this.#activeConditionInclude,
          include: {
            category: { select: { id: true, name: true } },
          },
        },
        variantStocks: {
          select: {
            conditionCategoryId: true,
            colorId: true,
            storageOptionId: true,
            stockQuantity: true,
            price: true,
            compareAtPrice: true,
            expressDeliveryEnabled: true,
          },
        },
      },
    });

    if (!product) {
      throw new AppError("Product not found", 404);
    }

    const formatted = this.#formatProduct(product);

    // Fetch up to 8 related products from the same series (public only)
    if (includeRelated) {
      const relatedProducts = await prisma.product.findMany({
        where: {
          seriesId: product.seriesId,
          id: { not: id },
          isDeleted: false,
          listingStatus: 'ACTIVE',
        },
        include: {
          productGalleries: {
            ...this.#activeGalleryInclude,
            take: 1,
          },
          series: { select: { id: true, name: true } },
        },
        take: 8,
      });

      formatted.relatedProducts = relatedProducts.map(p => ({
        id: p.id,
        title: p.title,
        basePrice: parseFloat(p.basePrice),
        compareAtPrice:
          p.compareAtPrice != null ? parseFloat(p.compareAtPrice) : null,
        thumbnail: p.productGalleries?.[0] 
          ? buildImageUrl(p.productGalleries[0].imageUrl)
          : null,
        series: p.series,
      }));
    }

    return formatted;
  }

  /**
   * Update Product (Partial Update)
   */
  async updateProduct(id, data, files) {
    // Helper to safely parse JSON arrays from form-data
    const parseArray = (val) => {
      if (!val) return null;
      if (Array.isArray(val)) return val;
      try {
        return JSON.parse(val);
      } catch (e) {
        throw new AppError(`Invalid array format: ${val}`, 400);
      }
    };

    // Parse all JSON fields upfront
    let parsedFaqs = null;
    let parsedHighlights = null;
    let parsedSpecs = null;
    let parsedIncludedItems = null;
    let parsedColors = null;
    let parsedStorages = null;

    if (data.faqs !== undefined) {
      parsedFaqs = parseArray(data.faqs);
      if (parsedFaqs && !Array.isArray(parsedFaqs)) {
        throw new AppError("Invalid FAQs format. Must be a valid JSON array.", 400);
      }
    }

    if (data.highlights !== undefined) {
      parsedHighlights = parseArray(data.highlights);
      if (parsedHighlights && !Array.isArray(parsedHighlights)) {
        throw new AppError("Invalid Highlights format. Must be a valid JSON array.", 400);
      }
    }

    if (data.specifications !== undefined) {
      parsedSpecs = parseArray(data.specifications);
      if (parsedSpecs && !Array.isArray(parsedSpecs)) {
        throw new AppError("Invalid Specifications format. Must be a valid JSON array.", 400);
      }
    }

    if (data.includedItems !== undefined) {
      parsedIncludedItems = parseArray(data.includedItems);
      if (parsedIncludedItems && !Array.isArray(parsedIncludedItems)) {
        throw new AppError("Invalid includedItems format. Must be a valid JSON array.", 400);
      }
    }

    if (data.colorIds) parsedColors = parseArray(data.colorIds);
    if (data.storageOptionIds) parsedStorages = parseArray(data.storageOptionIds);
    let parsedConditionCategoryIds = null;
    if (data.conditionCategoryIds !== undefined) {
      parsedConditionCategoryIds = parseArray(data.conditionCategoryIds) || [];
    }

    let existingStorageIds = null;
    if (!parsedStorages) {
      const existingStorages = await prisma.productStorageOption.findMany({
        where: { productId: id },
        select: { storageOptionId: true },
      });
      existingStorageIds = existingStorages.map((row) => row.storageOptionId);
    }

    const storageIdsForStock = parsedStorages || existingStorageIds || [];
    const fallbackStock =
      data.stockQuantity !== undefined
        ? parseInt(data.stockQuantity, 10) || 0
        : 0;
    const fallbackPrice =
      data.basePrice !== undefined && data.basePrice !== null && data.basePrice !== ''
        ? Number(data.basePrice)
        : null;
    const shouldSyncStorageVariants =
      data.storageStocks !== undefined || parsedStorages;
    const storageVariantMap = shouldSyncStorageVariants
      ? this.#parseStorageVariants(
          data.storageStocks,
          storageIdsForStock,
          { fallbackStock, fallbackPrice },
        )
      : null;

    const shouldSyncConditions =
      data.conditionCategoryIds !== undefined || data.conditionStocks !== undefined;
    let conditionCategoryIdsForStock = parsedConditionCategoryIds;
    if (shouldSyncConditions && !conditionCategoryIdsForStock) {
      const existingConditions = await prisma.productCondition.findMany({
        where: { productId: id },
        select: { categoryId: true },
      });
      conditionCategoryIdsForStock = existingConditions.map((row) => row.categoryId);
    }
    const conditionVariantMap = shouldSyncConditions
      ? this.#parseProductConditions(
          data.conditionStocks,
          conditionCategoryIdsForStock || [],
          { fallbackStock, fallbackPrice },
        )
      : null;

    const updateData = {};
    const allowedFields = [
      "title",
      "description",
      "introduction",
      "basePrice",
      "compareAtPrice",
      "listingStatus",
    ];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updateData[field] =
          field === "basePrice" || field === "compareAtPrice"
            ? data[field] === '' || data[field] == null
              ? field === "compareAtPrice"
                ? null
                : Number(data[field])
              : Number(data[field])
            : data[field];
      }
    }

    if (data.categoryId || data.conditionId !== undefined) {
      const current = await prisma.product.findUnique({
        where: { id },
        select: { categoryId: true, conditionId: true },
      });
      if (!current) throw new AppError('Product not found.', 404);

      if (data.categoryId) {
        const category = await prisma.category.findUnique({
          where: { id: data.categoryId },
          select: { name: true },
        });
        if (!category) throw new AppError('Invalid category ID.', 400);
      }

      // Empty string from FormData → clear condition (listings are category-only)
      if (data.conditionId === '' || data.conditionId === null) {
        data.conditionId = null;
      } else if (data.conditionId) {
        const condition = await prisma.condition.findUnique({
          where: { id: data.conditionId },
          select: { id: true },
        });
        if (!condition) throw new AppError('Invalid condition ID.', 400);
      }
    }

    if (data.categoryId) {
      updateData.category = { connect: { id: data.categoryId } };
    }
    if (data.seriesId) updateData.series = { connect: { id: data.seriesId } };
    if (data.deviceModelId) {
      updateData.deviceModel = { connect: { id: data.deviceModelId } };
    }
    if (data.conditionId) {
      updateData.condition = { connect: { id: data.conditionId } };
    } else if (data.conditionId === null) {
      updateData.condition = { disconnect: true };
    }

    const keptImages = data.keptImages
      ? this.#parseJsonField(data.keptImages, 'keptImages')
      : null;
    const removedImageIds = data.removedImageIds
      ? this.#parseJsonField(data.removedImageIds, 'removedImageIds')
      : null;

    if (keptImages !== null && !Array.isArray(keptImages)) {
      throw new AppError('Invalid keptImages format. Must be a valid JSON array.', 400);
    }
    if (removedImageIds !== null && !Array.isArray(removedImageIds)) {
      throw new AppError('Invalid removedImageIds format. Must be a valid JSON array.', 400);
    }

    let galleryColorIds = parsedColors;
    if (!galleryColorIds) {
      const existingColors = await prisma.productColor.findMany({
        where: { productId: id },
        select: { colorId: true },
      });
      galleryColorIds = existingColors.map((c) => c.colorId);
    }

    const newGalleries =
      files && files.length > 0
        ? this.#buildGalleriesFromUploads(files, data.imageMeta, galleryColorIds)
        : [];

    if (keptImages?.length) {
      const allowedColors = new Set(galleryColorIds || []);
      for (const img of keptImages) {
        if (!img?.id) continue;
        const colorId = img.colorId || null;
        if (colorId && allowedColors.size > 0 && !allowedColors.has(colorId)) {
          throw new AppError(
            'keptImages colorId must match a selected product color.',
            400,
          );
        }
      }
    }

    if (parsedFaqs && Array.isArray(parsedFaqs)) {
      updateData.productFaqs = {
        deleteMany: {},
        create: parsedFaqs.map((faq, index) => ({
          question: faq.question,
          answer: faq.answer,
          displayOrder:
            Number.isFinite(Number(faq.displayOrder))
              ? Number(faq.displayOrder)
              : index,
        })),
      };
    }

    if (parsedHighlights && Array.isArray(parsedHighlights)) {
      updateData.highlights = {
        deleteMany: {},
        create: parsedHighlights.map((h) => ({
          title: h.title,
          description: h.description,
          iconUrl: h.iconUrl || null,
          displayOrder: h.displayOrder || 0,
        })),
      };
    }

    if (parsedSpecs && Array.isArray(parsedSpecs)) {
      updateData.specifications = {
        deleteMany: {},
        create: parsedSpecs.map((s) => ({
          name: s.name,
          value: s.value,
          displayOrder: s.displayOrder || 0,
        })),
      };
    }

    if (parsedIncludedItems && Array.isArray(parsedIncludedItems)) {
      updateData.includedItems = {
        deleteMany: {},
        create: parsedIncludedItems
          .filter((item) => item?.label?.trim())
          .map((item, index) => ({
            label: item.label.trim(),
            displayOrder: Number.isFinite(item.displayOrder)
              ? item.displayOrder
              : index,
          })),
      };
    }

    let storageOptionsSync = null;
    let conditionOptionsSync = null;
    let colorOptionsSync = null;
    let colorStockMapOnly = null;
    let variantStocksSync = null;

    const shouldSyncColorStocks =
      data.colorStocks !== undefined || parsedColors;
    const shouldSyncVariantStocks =
      data.variantStocks !== undefined ||
      parsedColors ||
      parsedStorages ||
      parsedConditionCategoryIds !== null ||
      data.colorStocks !== undefined ||
      data.storageStocks !== undefined ||
      data.conditionStocks !== undefined;

    if (parsedColors && parsedColors.length > 0) {
      const colorStocksProvided =
        data.colorStocks !== undefined &&
        data.colorStocks !== null &&
        data.colorStocks !== '';
      const colorStockMap = this.#parseColorStocks(
        data.colorStocks,
        parsedColors,
        { fallbackStock: 0 },
      );

      // When only colorIds change without colorStocks, keep existing per-color stock.
      if (!colorStocksProvided) {
        const existingColors = await prisma.productColor.findMany({
          where: { productId: id },
          includeDeleted: true,
          select: { colorId: true, stockQuantity: true },
        });
        for (const row of existingColors) {
          if (parsedColors.includes(row.colorId)) {
            colorStockMap.set(row.colorId, row.stockQuantity ?? 0);
          }
        }
      }

      colorOptionsSync = {
        colorIds: parsedColors,
        stockMap: colorStockMap,
      };
    } else if (shouldSyncColorStocks && data.colorStocks !== undefined) {
      const existingColors = await prisma.productColor.findMany({
        where: { productId: id },
        select: { colorId: true },
      });
      const existingColorIds = existingColors.map((row) => row.colorId);
      colorStockMapOnly = this.#parseColorStocks(
        data.colorStocks,
        existingColorIds,
        { fallbackStock: 0 },
      );
    }

    if (parsedStorages) {
      const variantMap =
        storageVariantMap ||
        this.#parseStorageVariants(null, parsedStorages, {
          fallbackStock,
          fallbackPrice,
        });
      storageOptionsSync = {
        storageIds: parsedStorages,
        variantMap,
      };
      // When buy-side conditions drive price/stock, leave product totals to condition sync.
      if (!shouldSyncConditions) {
        const existingConditionCount = await prisma.productCondition.count({
          where: { productId: id, isDeleted: false },
        });
        if (!existingConditionCount) {
          const variantRows = this.#variantMapToRows(variantMap);
          updateData.stockQuantity = sumStorageStocks(variantRows);
          if (variantRows.length > 0) {
            updateData.basePrice = minStoragePrice(
              variantRows,
              updateData.basePrice ?? fallbackPrice,
            );
          }
        }
      }
    } else if (storageVariantMap && storageVariantMap.size > 0) {
      if (!shouldSyncConditions) {
        const existingConditionCount = await prisma.productCondition.count({
          where: { productId: id, isDeleted: false },
        });
        if (!existingConditionCount) {
          const variantRows = this.#variantMapToRows(storageVariantMap);
          updateData.stockQuantity = sumStorageStocks(variantRows);
          updateData.basePrice = minStoragePrice(
            variantRows,
            updateData.basePrice ?? fallbackPrice,
          );
        }
      }
    } else if (data.stockQuantity !== undefined && !shouldSyncConditions) {
      updateData.stockQuantity = parseInt(data.stockQuantity, 10) || 0;
    }

    if (shouldSyncConditions) {
      const conditionIds =
        parsedConditionCategoryIds ?? conditionCategoryIdsForStock ?? [];
      if (conditionIds.length > 0) {
        const categories = await prisma.category.findMany({
          where: { id: { in: conditionIds } },
          select: { id: true },
        });
        if (categories.length !== conditionIds.length) {
          throw new AppError('One or more condition category IDs are invalid.', 400);
        }
      }

      const variantMap =
        conditionVariantMap ||
        this.#parseProductConditions(null, conditionIds, {
          fallbackStock,
          fallbackPrice,
        });

      // Preserve existing prices/stocks when conditionStocks omitted but IDs change
      if (
        parsedConditionCategoryIds &&
        (data.conditionStocks === undefined ||
          data.conditionStocks === null ||
          data.conditionStocks === '')
      ) {
        const existingConditions = await prisma.productCondition.findMany({
          where: { productId: id },
          includeDeleted: true,
          select: {
            categoryId: true,
            stockQuantity: true,
            price: true,
            compareAtPrice: true,
          },
        });
        for (const row of existingConditions) {
          if (conditionIds.includes(row.categoryId)) {
            variantMap.set(row.categoryId, {
              stockQuantity: row.stockQuantity ?? 0,
              price: row.price != null ? Number(row.price) : null,
              compareAtPrice:
                row.compareAtPrice != null ? Number(row.compareAtPrice) : null,
            });
          }
        }
      }

      conditionOptionsSync = {
        categoryIds: conditionIds,
        variantMap,
      };

      if (conditionIds.length > 0) {
        const variantStocksProvided =
          data.variantStocks !== undefined &&
          data.variantStocks !== null &&
          data.variantStocks !== '';
        if (!variantStocksProvided && !shouldSyncVariantStocks) {
          const missingPrices = conditionIds.filter((categoryId) => {
            const variant = variantMap.get(categoryId);
            return !variant?.price || variant.price <= 0;
          });
          if (missingPrices.length > 0) {
            throw new AppError(
              'Each selected condition must have a price greater than 0.',
              400,
            );
          }
        }
        // Matrix cells own product totals when present / being synced.
        if (!shouldSyncVariantStocks) {
          const existingVariantCount = await prisma.productVariantStock.count({
            where: { productId: id },
          });
          if (existingVariantCount === 0) {
            const conditionRows = this.#conditionMapToRows(variantMap);
            updateData.stockQuantity = sumConditionStocks(conditionRows);
            updateData.basePrice = minConditionPrice(
              conditionRows,
              updateData.basePrice ?? fallbackPrice,
            );
          }
        }
      } else {
        // Clearing all conditions — fall back to storage/matrix totals
        conditionOptionsSync = { categoryIds: [], variantMap: new Map() };
        if (storageOptionsSync) {
          const variantRows = this.#variantMapToRows(storageOptionsSync.variantMap);
          updateData.stockQuantity = sumStorageStocks(variantRows);
          if (variantRows.length > 0) {
            updateData.basePrice = minStoragePrice(
              variantRows,
              updateData.basePrice ?? fallbackPrice,
            );
          }
        } else if (storageVariantMap && storageVariantMap.size > 0) {
          const variantRows = this.#variantMapToRows(storageVariantMap);
          updateData.stockQuantity = sumStorageStocks(variantRows);
          updateData.basePrice = minStoragePrice(
            variantRows,
            updateData.basePrice ?? fallbackPrice,
          );
        }
      }
    }

    if (shouldSyncVariantStocks) {
      let colorIdsForVariants =
        colorOptionsSync?.colorIds ||
        (colorStockMapOnly ? [...colorStockMapOnly.keys()] : null);
      if (!colorIdsForVariants) {
        const existingColors = await prisma.productColor.findMany({
          where: { productId: id },
          select: { colorId: true },
        });
        colorIdsForVariants = existingColors.map((row) => row.colorId);
      }

      const storageIdsForVariants =
        storageOptionsSync?.storageIds || storageIdsForStock;

      let conditionIdsForVariants =
        conditionOptionsSync?.categoryIds ??
        parsedConditionCategoryIds ??
        null;
      if (conditionIdsForVariants == null) {
        const existingConditions = await prisma.productCondition.findMany({
          where: { productId: id, isDeleted: false },
          select: { categoryId: true },
        });
        conditionIdsForVariants = existingConditions.map(
          (row) => row.categoryId,
        );
      }

      if (colorIdsForVariants.length && storageIdsForVariants.length) {
        let seedColorMap = colorOptionsSync?.stockMap || colorStockMapOnly;
        let seedStorageMap =
          storageOptionsSync?.variantMap || storageVariantMap;
        let seedConditionMap =
          conditionOptionsSync?.variantMap || conditionVariantMap;

        const variantStocksProvided =
          data.variantStocks !== undefined &&
          data.variantStocks !== null &&
          data.variantStocks !== '';

        const stockMap = this.#parseVariantStocks(
          data.variantStocks,
          colorIdsForVariants,
          storageIdsForVariants,
          conditionIdsForVariants,
          {
            colorStockMap: seedColorMap,
            storageVariantMap: seedStorageMap,
            conditionVariantMap: seedConditionMap,
          },
        );

        if (!variantStocksProvided) {
          const existingVariants = await prisma.productVariantStock.findMany({
            where: { productId: id },
            select: {
              colorId: true,
              storageOptionId: true,
              conditionCategoryId: true,
              stockQuantity: true,
              price: true,
              compareAtPrice: true,
              expressDeliveryEnabled: true,
            },
          });
          const conditionAllow =
            conditionIdsForVariants.length > 0
              ? new Set(conditionIdsForVariants)
              : null;
          for (const row of existingVariants) {
            const matchesColor = colorIdsForVariants.includes(row.colorId);
            const matchesStorage = storageIdsForVariants.includes(
              row.storageOptionId,
            );
            const matchesCondition = conditionAllow
              ? row.conditionCategoryId &&
                conditionAllow.has(row.conditionCategoryId)
              : !row.conditionCategoryId;
            if (matchesColor && matchesStorage && matchesCondition) {
              stockMap.set(
                variantStockKey(
                  row.colorId,
                  row.storageOptionId,
                  row.conditionCategoryId,
                ),
                {
                  stockQuantity: row.stockQuantity ?? 0,
                  price: row.price != null ? Number(row.price) : null,
                  compareAtPrice:
                    row.compareAtPrice != null
                      ? Number(row.compareAtPrice)
                      : null,
                  expressDeliveryEnabled:
                    row.expressDeliveryEnabled !== false,
                },
              );
            }
          }
        }

        const {
          total,
          byColor,
          byStorage,
          byCondition,
          storagePriceBuckets,
        } = this.#aggregateVariantStockMap(stockMap);

        if (colorOptionsSync) {
          for (const colorId of colorOptionsSync.colorIds) {
            colorOptionsSync.stockMap.set(colorId, byColor.get(colorId) ?? 0);
          }
        }
        if (storageOptionsSync) {
          this.#applyMatrixRollupsToBridges({
            storageIds: storageOptionsSync.storageIds,
            storageVariantMap: storageOptionsSync.variantMap,
            byStorage,
            storagePriceBuckets,
          });
        }
        if (conditionOptionsSync) {
          this.#applyMatrixRollupsToBridges({
            conditionCategoryIds: conditionOptionsSync.categoryIds,
            conditionVariantMap: conditionOptionsSync.variantMap,
            byCondition,
          });
        }

        updateData.stockQuantity = total;
        updateData.basePrice = minMatrixPrice(
          stockMap,
          updateData.basePrice ?? fallbackPrice,
        );

        if (
          conditionOptionsSync &&
          conditionOptionsSync.categoryIds.length > 0
        ) {
          const missingConditionPrices =
            conditionOptionsSync.categoryIds.filter((categoryId) => {
              const variant = conditionOptionsSync.variantMap.get(categoryId);
              return !variant?.price || variant.price <= 0;
            });
          if (missingConditionPrices.length > 0) {
            throw new AppError(
              'Each selected condition must have a price greater than 0.',
              400,
            );
          }
        }

        const missingCellPrices = [...stockMap.values()].filter(
          (cell) => !cell?.price || cell.price <= 0,
        );
        if (missingCellPrices.length > 0) {
          throw new AppError(
            'Each variant (condition × colour × storage) must have a price greater than 0.',
            400,
          );
        }

        variantStocksSync = {
          colorIds: colorIdsForVariants,
          storageIds: storageIdsForVariants,
          conditionCategoryIds: conditionIdsForVariants,
          stockMap,
        };
      }
    }

    const hasGalleryUpdates =
      keptImages !== null ||
      removedImageIds !== null ||
      newGalleries.length > 0;
    const legacyGalleryReplace = !hasGalleryUpdates && files && files.length > 0;

    if (legacyGalleryReplace) {
      const legacyGalleries = files.map((file, index) =>
        this.#toNestedGalleryCreate({
          imageUrl: file.path.replace(/\\/g, '/'),
          displayOrder: index,
          colorId: null,
        }),
      );

      updateData.productGalleries = {
        deleteMany: {},
        create: legacyGalleries,
      };
    }

    const updatedProduct = await prisma.$transaction(async (tx) => {
      let restockedVariants = [];

      if (colorOptionsSync) {
        await this.#syncProductColorOptions(
          tx,
          id,
          colorOptionsSync.colorIds,
          colorOptionsSync.stockMap,
        );
      }

      if (storageOptionsSync) {
        await this.#syncProductStorageOptions(
          tx,
          id,
          storageOptionsSync.storageIds,
          storageOptionsSync.variantMap,
        );
      }

      if (conditionOptionsSync) {
        await this.#syncProductConditions(
          tx,
          id,
          conditionOptionsSync.categoryIds,
          conditionOptionsSync.variantMap,
        );
      }

      if (variantStocksSync) {
        restockedVariants = await this.#syncProductVariantStocks(
          tx,
          id,
          variantStocksSync.colorIds,
          variantStocksSync.storageIds,
          variantStocksSync.conditionCategoryIds,
          variantStocksSync.stockMap,
        );
      }

      if (hasGalleryUpdates) {
        if (removedImageIds?.length) {
          await tx.productGallery.deleteMany({
            where: { id: { in: removedImageIds }, productId: id },
          });
        }

        if (keptImages?.length) {
          await Promise.all(
            keptImages
              .filter((img) => img?.id)
              .map((img) =>
                tx.productGallery.updateMany({
                  where: { id: img.id, productId: id },
                  data: {
                    colorId: img.colorId || null,
                    displayOrder: Number.isFinite(img.displayOrder)
                      ? img.displayOrder
                      : 0,
                  },
                }),
              ),
          );
        }

        if (newGalleries.length > 0) {
          await tx.productGallery.createMany({
            data: newGalleries.map((g) => ({ ...g, productId: id })),
          });
        }
      }

      if (parsedColors && parsedColors.length > 0) {
        await tx.productGallery.deleteMany({
          where: {
            productId: id,
            colorId: { notIn: parsedColors },
          },
        });
      }

      if (storageVariantMap && storageVariantMap.size > 0 && !parsedStorages) {
        await Promise.all(
          [...storageVariantMap.entries()].map(([storageOptionId, variant]) =>
            tx.productStorageOption.updateMany({
              where: { productId: id, storageOptionId },
              data: {
                ...(variantStocksSync
                  ? {}
                  : { stockQuantity: variant.stockQuantity ?? 0 }),
                ...(variant.price != null ? { price: variant.price } : {}),
                ...(variant.compareAtPrice !== undefined
                  ? { compareAtPrice: variant.compareAtPrice } : {}),
              },
            }),
          ),
        );
      }

      if (colorStockMapOnly && colorStockMapOnly.size > 0 && !variantStocksSync) {
        await Promise.all(
          [...colorStockMapOnly.entries()].map(([colorId, stockQuantity]) =>
            tx.productColor.updateMany({
              where: { productId: id, colorId },
              data: { stockQuantity },
            }),
          ),
        );
      }

      // When matrix updated without full color/storage sync, refresh aggregates
      if (variantStocksSync && !colorOptionsSync) {
        const { byColor } = this.#aggregateVariantStockMap(
          variantStocksSync.stockMap,
        );
        await Promise.all(
          [...byColor.entries()].map(([colorId, stockQuantity]) =>
            tx.productColor.updateMany({
              where: { productId: id, colorId },
              data: { stockQuantity },
            }),
          ),
        );
      }
      if (variantStocksSync && !storageOptionsSync) {
        const { byStorage, storagePriceBuckets } =
          this.#aggregateVariantStockMap(variantStocksSync.stockMap);
        await Promise.all(
          [...byStorage.entries()].map(([storageOptionId, stockQuantity]) => {
            const priceBucket = storagePriceBuckets.get(storageOptionId);
            const minPrice = priceBucket?.prices?.length
              ? Math.min(...priceBucket.prices)
              : undefined;
            const minCompare = priceBucket?.compareAts?.length
              ? Math.min(...priceBucket.compareAts)
              : null;
            return tx.productStorageOption.updateMany({
              where: { productId: id, storageOptionId },
              data: {
                stockQuantity,
                ...(minPrice != null ? { price: minPrice } : {}),
                compareAtPrice: minCompare,
              },
            });
          }),
        );
      }

      const product = await tx.product.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
        },
      });

      if (
        variantStocksSync ||
        conditionOptionsSync ||
        colorOptionsSync ||
        storageOptionsSync
      ) {
        await syncProductStockTotal(tx, id);
      }

      return {
        product,
        restockedVariants,
      };
    }, this.#transactionOptions).catch((error) => {
      // Handle Prisma P2025 error (Record not found)
      if (error.code === 'P2025') {
        throw new AppError('Product not found', 404);
      }
      throw error;
    });

    if (updatedProduct.restockedVariants?.length) {
      stockNotificationService
        .notifyRestockedVariants(id, updatedProduct.restockedVariants)
        .catch((err) => console.error('[StockNotification] Restock notify failed:', err));
    }

    return updatedProduct.product;
  }

  /**
   * Delete a single product gallery image (admin only)
   */
  async deleteProductGalleryImage(productId, imageId) {
    const galleryImage = await prisma.productGallery.findFirst({
      where: { id: imageId, productId },
      select: { id: true, isDeleted: true },
      includeDeleted: true,
    });

    if (!galleryImage) {
      throw new AppError('Product image not found.', 404);
    }

    if (galleryImage.isDeleted) {
      return true;
    }

    try {
      await prisma.productGallery.delete({
        where: { id: imageId },
      });
      return true;
    } catch (error) {
      if (error.code === 'P2025') {
        throw new AppError('Product image not found.', 404);
      }
      throw error;
    }
  }

  /**
   * Delete Product (Soft delete is handled by global Prisma extension)
   */
  async deleteProduct(id) {
    // The Prisma extension will automatically intercept this and convert it to an update (isDeleted: true)
    // If product doesn't exist, Prisma will throw P2025 error
    try {
      await prisma.product.delete({
        where: { id },
      });
      return true;
    } catch (error) {
      if (error.code === 'P2025') {
        throw new AppError('Product not found', 404);
      }
      throw error;
    }
  }
 
  /**
   * Toggle or set featured flag for a product (admin only)
   */
  async changeProductFeatured(id, featured) {
    const isFeatured = Boolean(featured === true || featured === 'true' || featured === '1' || featured === 1);

    try {
      // If setting as featured, check if we already have 8 featured products
      if (isFeatured) {
        const currentProduct = await prisma.product.findUnique({
          where: { id, isDeleted: false },
          select: { isFeatured: true },
        });

        if (!currentProduct) {
          throw new AppError('Product not found', 404);
        }

        // Only check limit if this product is not already featured
        if (!currentProduct.isFeatured) {
          const featuredCount = await prisma.product.count({
            where: { isFeatured: true, isDeleted: false },
          });

          if (featuredCount >= 8) {
            throw new AppError('Maximum 8 featured products allowed. Please unfeature one before featuring another.', 400);
          }
        }
      }

      const updated = await prisma.product.update({
        where: { id },
        data: {
          isFeatured: isFeatured,
          featuredAt: isFeatured ? new Date() : null,
        },
        select: {
          id: true,
          title: true,
          isFeatured: true,
          featuredAt: true,
        },
      });
      return updated;
    } catch (err) {
      if (err.code === 'P2025') throw new AppError('Product not found', 404);
      throw err;
    }
  }
}
export default new ProductService();
