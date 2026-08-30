import prisma from "../utils/prisma.js";
import AppError from "../utils/app-error.js";
import { buildImageUrl } from "../utils/url.js";
import {
  sumStorageStocks,
  sumVariantStocks,
  minStoragePrice,
  sortStorageOptionsBySize,
  variantStockKey,
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
   * Parse color × storage matrix stocks.
   * Returns Map keyed by `${colorId}::${storageOptionId}` → stockQuantity.
   * When raw is empty, fills from colorStockMap × storageVariantMap (min) or zeros.
   */
  #parseVariantStocks(
    raw,
    colorIds,
    storageIds,
    { colorStockMap = null, storageVariantMap = null } = {},
  ) {
    const stockMap = new Map();
    if (!colorIds?.length || !storageIds?.length) {
      return stockMap;
    }

    let entries = raw;
    if (typeof entries === 'string') {
      entries = this.#parseJsonField(entries, 'variantStocks');
    }

    if (Array.isArray(entries)) {
      const colorSet = new Set(colorIds);
      const storageSet = new Set(storageIds);
      for (const entry of entries) {
        const colorId = entry?.colorId;
        const storageOptionId = entry?.storageOptionId;
        if (!colorId || !storageOptionId) continue;
        if (!colorSet.has(colorId) || !storageSet.has(storageOptionId)) continue;
        stockMap.set(
          variantStockKey(colorId, storageOptionId),
          Math.max(0, parseInt(entry.stockQuantity, 10) || 0),
        );
      }
    } else if (raw !== undefined && raw !== null && raw !== '') {
      throw new AppError(
        'Invalid variantStocks format. Must be a valid JSON array.',
        400,
      );
    }

    for (const colorId of colorIds) {
      for (const storageOptionId of storageIds) {
        const key = variantStockKey(colorId, storageOptionId);
        if (stockMap.has(key)) continue;

        const colorStock = colorStockMap?.has(colorId)
          ? colorStockMap.get(colorId)
          : null;
        const storageStock = storageVariantMap?.get(storageOptionId)?.stockQuantity;
        if (colorStock != null && storageStock != null) {
          stockMap.set(key, Math.min(colorStock, storageStock));
        } else if (storageStock != null && (colorStock == null || colorStock === 0)) {
          // Legacy: only storage stock set → equal share across colors
          stockMap.set(
            key,
            Math.floor((Number(storageStock) || 0) / Math.max(colorIds.length, 1)),
          );
        } else {
          stockMap.set(key, Math.max(0, Number(colorStock) || 0));
        }
      }
    }

    return stockMap;
  }

  #aggregateVariantStockMap(stockMap) {
    const byColor = new Map();
    const byStorage = new Map();
    let total = 0;
    for (const [key, qty] of stockMap.entries()) {
      const amount = Math.max(0, Number(qty) || 0);
      total += amount;
      const [colorId, storageOptionId] = key.split('::');
      byColor.set(colorId, (byColor.get(colorId) || 0) + amount);
      byStorage.set(storageOptionId, (byStorage.get(storageOptionId) || 0) + amount);
    }
    return { total, byColor, byStorage };
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

  async #syncProductVariantStocks(tx, productId, colorIds, storageIds, stockMap) {
    const existing = await tx.productVariantStock.findMany({
      where: { productId },
      select: {
        id: true,
        colorId: true,
        storageOptionId: true,
        stockQuantity: true,
      },
    });

    const existingStockByKey = new Map(
      existing.map((row) => [
        variantStockKey(row.colorId, row.storageOptionId),
        Number(row.stockQuantity) || 0,
      ]),
    );

    const targetKeys = new Set();
    for (const colorId of colorIds) {
      for (const storageOptionId of storageIds) {
        targetKeys.add(variantStockKey(colorId, storageOptionId));
      }
    }

    await Promise.all(
      existing
        .filter(
          (row) =>
            !targetKeys.has(variantStockKey(row.colorId, row.storageOptionId)),
        )
        .map((row) => tx.productVariantStock.delete({ where: { id: row.id } })),
    );

    const existingByKey = new Map(
      existing.map((row) => [
        variantStockKey(row.colorId, row.storageOptionId),
        row,
      ]),
    );

    const restockedVariants = [];

    await Promise.all(
      colorIds.flatMap((colorId) =>
        storageIds.map(async (storageOptionId) => {
          const key = variantStockKey(colorId, storageOptionId);
          const stockQuantity = stockMap.get(key) ?? 0;
          const previousStock = existingStockByKey.get(key) ?? 0;
          const current = existingByKey.get(key);
          if (current) {
            await tx.productVariantStock.update({
              where: { id: current.id },
              data: { stockQuantity },
            });
          } else {
            await tx.productVariantStock.create({
              data: {
                productId,
                colorId,
                storageOptionId,
                stockQuantity,
              },
            });
          }

          if (previousStock <= 0 && stockQuantity > 0) {
            restockedVariants.push({ colorId, storageOptionId });
          }
        }),
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

    return {
      id: product.id,
      title: product.title,
      description: product.description,
      introduction: product.introduction,
      basePrice: product.basePrice,
      compareAtPrice:
        product.compareAtPrice != null ? parseFloat(product.compareAtPrice) : null,
      stockQuantity:
        sumVariantStocks(product.variantStocks) ||
        sumStorageStocks(product.storageOptions) ||
        product.stockQuantity ||
        0,
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
      faqs: (product.productFaqs || []).map((f) => ({
        id: f.id,
        question: f.question,
        answer: f.answer,
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
          name: ps.storageOption.name,
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
      availableVariantStocks: (product.variantStocks || []).map((vs) => ({
        colorId: vs.colorId,
        storageOptionId: vs.storageOptionId,
        stockQuantity: vs.stockQuantity ?? 0,
      })),
    };
  }

  /**
   * Lightweight formatter for list/card views (admin product grid).
   * Returns only what is needed to render a product card.
   */
  #formatProductCard(product) {
    // First image as thumbnail
    const thumbnail = product.productGalleries?.[0]
      ? buildImageUrl(product.productGalleries[0].imageUrl)
      : null;

    const productRrp =
      product.compareAtPrice != null ? parseFloat(product.compareAtPrice) : null;
    const storages = product.storageOptions || [];
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
    const compareAtPrice =
      storageRrp > 0 ? storageRrp : productRrp > 0 ? productRrp : null;

    return {
      id: product.id,
      title: product.title,
      basePrice: product.basePrice,
      compareAtPrice,
      stockQuantity:
        sumVariantStocks(product.variantStocks) ||
        sumStorageStocks(product.storageOptions) ||
        product.stockQuantity ||
        0,
      listingStatus: product.listingStatus,
      thumbnail,
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
          productFaqs = parsedFaqs.map((faq) => ({
            question: faq.question,
            answer: faq.answer,
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

    if (colors.length === 0 || storages.length === 0) {
      throw new AppError(
        "At least one Color and Storage Option must be selected.",
        400,
      );
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
    const colorStockMap = this.#parseColorStocks(data.colorStocks, colors, {
      fallbackStock: parsedStock,
    });
    const variantStockMap = this.#parseVariantStocks(
      data.variantStocks,
      colors,
      storages,
      { colorStockMap, storageVariantMap },
    );
    const { total: totalStock, byColor, byStorage } =
      this.#aggregateVariantStockMap(variantStockMap);

    // Prefer matrix totals on storage/color bridges when colors + storages exist
    if (colors.length && storages.length) {
      for (const storageId of storages) {
        const current = storageVariantMap.get(storageId) || {
          stockQuantity: 0,
          price: parsedPrice,
        };
        storageVariantMap.set(storageId, {
          ...current,
          stockQuantity: byStorage.get(storageId) ?? 0,
        });
      }
      for (const colorId of colors) {
        colorStockMap.set(colorId, byColor.get(colorId) ?? 0);
      }
    }

    const storageVariantRows = this.#variantMapToRows(storageVariantMap);
    const productTotalStock =
      colors.length && storages.length
        ? totalStock
        : sumStorageStocks(storageVariantRows);
    const productBasePrice = minStoragePrice(storageVariantRows, parsedPrice);

    if (!storages.length && (parsedPrice == null || Number.isNaN(parsedPrice))) {
      throw new AppError(
        'Missing required product fields (title, basePrice, categoryId, seriesId, deviceModelId)',
        400,
      );
    }

    if (storages.length) {
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
          ...(colors.length && storages.length
            ? {
                variantStocks: {
                  create: [...variantStockMap.entries()].map(([key, stockQuantity]) => {
                    const [colorId, storageOptionId] = key.split('::');
                    return { colorId, storageOptionId, stockQuantity };
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
    if (categoryId) where.categoryId = categoryId;
    if (seriesId) where.seriesId = seriesId;
    if (deviceModelId) where.deviceModelId = deviceModelId;
    if (isFeatured !== undefined) where.isFeatured = isFeatured === 'true' || isFeatured === true;
    if (priceMin !== undefined || priceMax !== undefined) {
      where.basePrice = {};
      if (priceMin !== undefined) where.basePrice.gte = Number(priceMin);
      if (priceMax !== undefined) where.basePrice.lte = Number(priceMax);
    }
    if (search) {
      where.OR = [
        { title: { contains: String(search), mode: 'insensitive' } },
        { description: { contains: String(search), mode: 'insensitive' } },
      ];
    }

    // Build relation filters for options
    if (colorId) where.colors = { some: { colorId } };
    if (storageOptionId) where.storageOptions = { some: { storageOptionId } };

    // When sortBy=featured, automatically filter to featured products only
    if (sortBy === 'featured') {
      where.isFeatured = true;
    }

    const take = Math.min(Number(limit) || 24, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const orderBy = [];
    if (sortBy === 'priceAsc') orderBy.push({ basePrice: 'asc' });
    else if (sortBy === 'priceDesc') orderBy.push({ basePrice: 'desc' });
    else if (sortBy === 'featured') orderBy.push({ isFeatured: 'desc' });
    orderBy.push({ createdAt: 'desc' });

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
          take: 1,
        },
        colors: { ...this.#activeColorInclude, select: { colorId: true } },
        storageOptions: {
          ...this.#activeStorageInclude,
          select: { storageOptionId: true, stockQuantity: true, price: true, compareAtPrice: true },
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
        variantStocks: {
          select: {
            colorId: true,
            storageOptionId: true,
            stockQuantity: true,
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
        create: parsedFaqs.map((faq) => ({
          question: faq.question,
          answer: faq.answer,
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
    let colorOptionsSync = null;
    let colorStockMapOnly = null;
    let variantStocksSync = null;

    const shouldSyncColorStocks =
      data.colorStocks !== undefined || parsedColors;
    const shouldSyncVariantStocks =
      data.variantStocks !== undefined ||
      parsedColors ||
      parsedStorages ||
      data.colorStocks !== undefined ||
      data.storageStocks !== undefined;

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
      const variantRows = this.#variantMapToRows(variantMap);
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
    } else if (data.stockQuantity !== undefined) {
      updateData.stockQuantity = parseInt(data.stockQuantity, 10) || 0;
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

      if (colorIdsForVariants.length && storageIdsForVariants.length) {
        let seedColorMap = colorOptionsSync?.stockMap || colorStockMapOnly;
        let seedStorageMap =
          storageOptionsSync?.variantMap || storageVariantMap;

        // Preserve existing matrix cells when variantStocks payload is omitted
        const variantStocksProvided =
          data.variantStocks !== undefined &&
          data.variantStocks !== null &&
          data.variantStocks !== '';

        const stockMap = this.#parseVariantStocks(
          data.variantStocks,
          colorIdsForVariants,
          storageIdsForVariants,
          {
            colorStockMap: seedColorMap,
            storageVariantMap: seedStorageMap,
          },
        );

        if (!variantStocksProvided) {
          const existingVariants = await prisma.productVariantStock.findMany({
            where: { productId: id },
            select: {
              colorId: true,
              storageOptionId: true,
              stockQuantity: true,
            },
          });
          for (const row of existingVariants) {
            const key = variantStockKey(row.colorId, row.storageOptionId);
            if (
              colorIdsForVariants.includes(row.colorId) &&
              storageIdsForVariants.includes(row.storageOptionId)
            ) {
              stockMap.set(key, row.stockQuantity ?? 0);
            }
          }
        }

        const { total, byColor, byStorage } =
          this.#aggregateVariantStockMap(stockMap);

        // Apply aggregated totals onto color/storage sync maps
        if (colorOptionsSync) {
          for (const colorId of colorOptionsSync.colorIds) {
            colorOptionsSync.stockMap.set(colorId, byColor.get(colorId) ?? 0);
          }
        }
        if (storageOptionsSync) {
          for (const storageId of storageOptionsSync.storageIds) {
            const current =
              storageOptionsSync.variantMap.get(storageId) || {
                stockQuantity: 0,
                price: null,
              };
            storageOptionsSync.variantMap.set(storageId, {
              ...current,
              stockQuantity: byStorage.get(storageId) ?? 0,
            });
          }
        }

        updateData.stockQuantity = total;
        variantStocksSync = {
          colorIds: colorIdsForVariants,
          storageIds: storageIdsForVariants,
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

      if (variantStocksSync) {
        restockedVariants = await this.#syncProductVariantStocks(
          tx,
          id,
          variantStocksSync.colorIds,
          variantStocksSync.storageIds,
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
        const { byStorage } = this.#aggregateVariantStockMap(
          variantStocksSync.stockMap,
        );
        await Promise.all(
          [...byStorage.entries()].map(([storageOptionId, stockQuantity]) =>
            tx.productStorageOption.updateMany({
              where: { productId: id, storageOptionId },
              data: { stockQuantity },
            }),
          ),
        );
      }

      return {
        product: await tx.product.update({
          where: { id },
          data: updateData,
          select: {
            id: true,
          },
        }),
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
