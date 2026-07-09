import prisma from "../utils/prisma.js";
import AppError from "../utils/app-error.js";
import { buildImageUrl } from "../utils/url.js";
import { sumStorageStocks, minStoragePrice } from "../utils/stock.js";

class ProductService {
  #activeGalleryInclude = {
    where: { isDeleted: false },
    orderBy: { displayOrder: 'asc' },
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

      variantMap.set(storageOptionId, {
        stockQuantity: Math.max(0, parseInt(entry.stockQuantity, 10) || 0),
        price,
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
    }));
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
        };
        const current = existingByStorageId.get(storageOptionId);

        if (current) {
          await tx.productStorageOption.update({
            where: { id: current.id },
            data: {
              stockQuantity: variant.stockQuantity ?? 0,
              ...(variant.price != null ? { price: variant.price } : {}),
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
          },
        });
      }),
    );
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
      stockQuantity:
        sumStorageStocks(product.storageOptions) || product.stockQuantity || 0,
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
      })),
      availableStorageOptions: (product.storageOptions || []).map((ps) => ({
        id: ps.storageOption.id,
        name: ps.storageOption.name,
        stockQuantity: ps.stockQuantity ?? 0,
        price:
          ps.price != null
            ? parseFloat(ps.price)
            : parseFloat(product.basePrice),
      })),
      availableRamOptions: (product.ramOptions || []).map((pr) => ({
        id: pr.ramOption.id,
        name: pr.ramOption.name,
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

    return {
      id: product.id,
      title: product.title,
      basePrice: product.basePrice,
      stockQuantity:
        sumStorageStocks(product.storageOptions) || product.stockQuantity || 0,
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
      ramOptionIds: (product.ramOptions || []).map((pr) => pr.ramOptionId),
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
      ramOptionIds,
    } = data;

    // Use introduction as description since the UI only provides Introduction
    const description = data.description || introduction || title;

    // Validate required fields (conditionId is optional when category is "New")
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

    const categoryNameLower = String(category.name || '').toLowerCase();

    // "New" and "Sealed" category products have no condition (conditionId = null)
    let resolvedConditionId = null;
    if (categoryNameLower === 'new' || categoryNameLower === 'sealed') {
      resolvedConditionId = null;
    } else {
      // For non-"New" categories, conditionId is required
      if (!conditionId) {
        throw new AppError('conditionId is required for this category.', 400);
      }
      const condition = await prisma.condition.findUnique({ where: { id: conditionId }, select: { id: true, name: true } });
      if (!condition) throw new AppError('Invalid condition ID.', 400);
      // Business rule: "Used" category cannot have "New" condition
      if (categoryNameLower === 'used' && String(condition.name || '').toLowerCase() === 'new') {
        throw new AppError('Products in "Used" category cannot have "New" condition.', 400);
      }
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
    const rams = parseArray(ramOptionIds);

    if (colors.length === 0 || storages.length === 0 || rams.length === 0) {
      throw new AppError(
        "At least one Color, Storage Option, and RAM Option must be selected.",
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
    const storageVariantRows = this.#variantMapToRows(storageVariantMap);
    const totalStock = sumStorageStocks(storageVariantRows);
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
          stockQuantity: totalStock,
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
            create: colors.map((colorId) => ({ colorId })),
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
              };
            }),
          },
          ramOptions: {
            create: rams.map((ramId) => ({ ramOptionId: ramId })),
          },
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
    // colorId, storageOptionId, ramOptionId, priceMin, priceMax, search,
    // listingStatus, isFeatured
    // Pagination: page, limit
    const {
      categoryId,
      seriesId,
      deviceModelId,
      conditionId,
      colorId,
      storageOptionId,
      ramOptionId,
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
    if (ramOptionId) where.ramOptions = { some: { ramOptionId } };

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
        colors: { select: { colorId: true } },
        storageOptions: { select: { storageOptionId: true } },
        ramOptions: { select: { ramOptionId: true } },
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
          include: {
            color: { select: { id: true, name: true, hexCode: true } },
          },
        },
        storageOptions: {
          include: {
            storageOption: { select: { id: true, name: true } },
          },
        },
        ramOptions: {
          include: {
            ramOption: { select: { id: true, name: true } },
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
    let parsedRams = null;

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
    if (data.ramOptionIds) parsedRams = parseArray(data.ramOptionIds);

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
      "listingStatus",
    ];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updateData[field] =
          field === "basePrice"
            ? Number(data[field])
            : data[field];
      }
    }

    if (data.categoryId || data.conditionId) {
      const current = await prisma.product.findUnique({
        where: { id },
        select: { categoryId: true, conditionId: true },
      });
      if (!current) throw new AppError('Product not found.', 404);

      const finalCategoryId = data.categoryId || current.categoryId;

      const category = await prisma.category.findUnique({
        where: { id: finalCategoryId },
        select: { name: true },
      });
      if (!category) throw new AppError('Invalid category ID.', 400);

      const categoryNameLower = String(category.name || '').toLowerCase();

      if (categoryNameLower === 'new' || categoryNameLower === 'sealed') {
        data.conditionId = null;
      } else {
        const finalConditionId = data.conditionId || current.conditionId;
        const condition = await prisma.condition.findUnique({
          where: { id: finalConditionId },
          select: { name: true },
        });
        if (!condition) throw new AppError('Invalid condition ID.', 400);
        if (
          categoryNameLower === 'used' &&
          String(condition.name || '').toLowerCase() === 'new'
        ) {
          throw new AppError(
            'Products in "Used" category cannot have "New" condition.',
            400,
          );
        }
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

    if (parsedColors && parsedColors.length > 0) {
      updateData.colors = {
        deleteMany: {},
        create: parsedColors.map((colorId) => ({ colorId })),
      };
    }

    let storageOptionsSync = null;

    if (parsedStorages && parsedStorages.length > 0) {
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
      updateData.basePrice = minStoragePrice(
        variantRows,
        updateData.basePrice ?? fallbackPrice,
      );
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

    if (parsedRams && parsedRams.length > 0) {
      updateData.ramOptions = {
        deleteMany: {},
        create: parsedRams.map((ramId) => ({ ramOptionId: ramId })),
      };
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
      if (storageOptionsSync) {
        await this.#syncProductStorageOptions(
          tx,
          id,
          storageOptionsSync.storageIds,
          storageOptionsSync.variantMap,
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
                stockQuantity: variant.stockQuantity ?? 0,
                ...(variant.price != null ? { price: variant.price } : {}),
              },
            }),
          ),
        );
      }

      return await tx.product.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
        },
      });
    }, this.#transactionOptions).catch((error) => {
      // Handle Prisma P2025 error (Record not found)
      if (error.code === 'P2025') {
        throw new AppError('Product not found', 404);
      }
      throw error;
    });

    return updatedProduct;
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
