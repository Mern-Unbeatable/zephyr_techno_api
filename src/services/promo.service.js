import prisma from '../utils/prisma.js';
import AppError from '../utils/app-error.js';

class PromoService {
  async createPromo(data) {
    const {
      code,
      discountType,
      discountValue,
      minOrderValue,
      maxUsageCount,
      startDate,
      expiryDate,
      isActive = true,
    } = data;

    if (!code || !discountValue || !startDate || !expiryDate) {
      throw new AppError('Missing required promo fields (code, discountValue, startDate, expiryDate)', 400);
    }

    const parsedDiscount = Number(discountValue);
    if (isNaN(parsedDiscount)) throw new AppError('Invalid discountValue', 400);

    // normalize stringified arrays from form-data
    if (typeof data.applicableModelIds === 'string') {
      try { data.applicableModelIds = JSON.parse(data.applicableModelIds); } catch (e) { /* leave as-is */ }
    }

    // Check for duplicate code upfront (case-insensitive)
    const existing = await prisma.promoCode.findFirst({
      where: { code: { equals: code, mode: 'insensitive' }, isDeleted: false },
      select: { id: true },
    });
    if (existing) throw new AppError(`Promo code "${code}" already exists`, 409);

    const promo = await prisma.$transaction(async (tx) => {
      const created = await tx.promoCode.create({
        data: {
          code,
          discountType: discountType || 'PERCENTAGE',
          discountValue: parsedDiscount,
          minOrderValue: minOrderValue ? Number(minOrderValue) : null,
          maxUsageCount: maxUsageCount ? Number(maxUsageCount) : null,
          startDate: new Date(startDate),
          expiryDate: new Date(expiryDate),
          isActive: Boolean(isActive),
        },
      });

      // only model-level applicability is supported at create time
      if (Array.isArray(data.applicableModelIds) && data.applicableModelIds.length > 0) {
        // Validate that all provided model IDs actually exist
        const foundModels = await tx.deviceModel.findMany({
          where: { id: { in: data.applicableModelIds }, isDeleted: false },
          select: { id: true },
        });
        if (foundModels.length !== data.applicableModelIds.length) {
          const foundIds = foundModels.map((m) => m.id);
          const invalid = data.applicableModelIds.filter((id) => !foundIds.includes(id));
          throw new AppError(`Invalid model ID(s): ${invalid.join(', ')}`, 400);
        }

        await tx.promoCodeModelBridge.createMany({
          data: data.applicableModelIds.map((mId) => ({ promoCodeId: created.id, modelId: mId })),
          skipDuplicates: true,
        });
      }

      return created;
    }).catch((err) => {
      if (err.code === 'P2002') throw new AppError(`Promo code "${code}" already exists`, 409);
      throw err;
    });

    return promo;
  }

  async getAllPromos(query = {}) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Number(query.limit) || 20, 100);
    const offset = (page - 1) * limit;
    const now = new Date();

    const where = { isDeleted: false };
    if (query.q) {
      where.OR = [{ code: { contains: query.q, mode: 'insensitive' } }];
    }

    // status filter: active | expired
    if (query.status) {
      const status = query.status.toLowerCase();
      if (status === 'active') {
        where.isActive = true;
        where.expiryDate = { gt: now };
      } else if (status === 'expired') {
        where.expiryDate = { lte: now };
      }
    }

    // isActive filter: true | false
    if (query.isActive !== undefined && query.isActive !== '') {
      where.isActive = query.isActive === 'true' || query.isActive === true;
    }

    const [total, data] = await Promise.all([
      prisma.promoCode.count({ where }),
      prisma.promoCode.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          code: true,
          discountType: true,
          discountValue: true,
          minOrderValue: true,
          maxUsageCount: true,
          currentUsageCount: true,
          startDate: true,
          expiryDate: true,
          isActive: true,
          createdAt: true,
        },
      }),
    ]);

    return { total, data, page, limit };
  }

  async getPromoById(id) {
    try {
      const promo = await prisma.promoCode.findUnique({
        where: { id },
        include: {
          // if the Prisma client is up-to-date these relations will exist
          promoCodeSeriesBridge: { include: { series: { select: { id: true, name: true } } } },
          promoCodeModelBridge: { include: { deviceModel: { select: { id: true, name: true } } } },
        },
      });
      if (!promo) throw new AppError('Promo code not found', 404);
      return promo;
    } catch (err) {
      // Fallback for mismatched Prisma client: fetch base promo and bridges separately
      if (err.name && err.name.includes('Prisma')) {
        const promo = await prisma.promoCode.findFirst({ where: { id, isDeleted: false } });
        if (!promo) throw new AppError('Promo code not found', 404);

        const [seriesBridges, modelBridges] = await Promise.all([
          prisma.promoCodeSeriesBridge.findMany({ where: { promoCodeId: id, isDeleted: false }, include: { series: { select: { id: true, name: true } } } }),
          prisma.promoCodeModelBridge.findMany({ where: { promoCodeId: id, isDeleted: false }, include: { deviceModel: { select: { id: true, name: true } } } }),
        ]);

        // attach bridged arrays in a shape similar to the expected include
        return Object.assign(promo, {
          promoCodeSeriesBridge: seriesBridges,
          promoCodeModelBridge: modelBridges,
        });
      }
      throw err;
    }
  }

  async updatePromo(id, data) {
    const allowed = ['code','discountType','discountValue','minOrderValue','maxUsageCount','startDate','expiryDate','isActive','applicableCategoryIds','applicableSeriesIds','applicableModelIds'];
    const updateData = {};
    for (const k of allowed) if (data[k] !== undefined) updateData[k] = data[k];

    // normalize stringified arrays from form-data
    if (typeof updateData.applicableSeriesIds === 'string') {
      try { updateData.applicableSeriesIds = JSON.parse(updateData.applicableSeriesIds); } catch (e) { }
    }
    if (typeof updateData.applicableModelIds === 'string') {
      try { updateData.applicableModelIds = JSON.parse(updateData.applicableModelIds); } catch (e) { }
    }

    // coerce boolean-like strings to actual booleans for Prisma
    if (updateData.isActive !== undefined) {
      if (typeof updateData.isActive === 'string') {
        const normalized = updateData.isActive.trim().toLowerCase();
        if (normalized === 'true') updateData.isActive = true;
        else if (normalized === 'false') updateData.isActive = false;
        else updateData.isActive = Boolean(updateData.isActive);
      } else {
        updateData.isActive = Boolean(updateData.isActive);
      }
    }

    if (updateData.discountValue !== undefined) {
      const parsed = Number(updateData.discountValue);
      if (isNaN(parsed)) throw new AppError('Invalid discountValue', 400);
      updateData.discountValue = parsed;
    }
    if (updateData.minOrderValue !== undefined) updateData.minOrderValue = updateData.minOrderValue ? Number(updateData.minOrderValue) : null;
    if (updateData.maxUsageCount !== undefined) updateData.maxUsageCount = updateData.maxUsageCount ? Number(updateData.maxUsageCount) : null;
    if (updateData.startDate) updateData.startDate = new Date(updateData.startDate);
    if (updateData.expiryDate) updateData.expiryDate = new Date(updateData.expiryDate);

    try {
      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.promoCode.update({ where: { id }, data: updateData });

        if (Array.isArray(updateData.applicableCategoryIds)) {
          // soft-delete existing category bridges
          await tx.promoCodeCategoryBridge.updateMany({ where: { promoCodeId: id, isDeleted: false }, data: { isDeleted: true, deletedAt: new Date() } });
          if (updateData.applicableCategoryIds.length > 0) {
            await tx.promoCodeCategoryBridge.createMany({ data: updateData.applicableCategoryIds.map((cId) => ({ promoCodeId: id, categoryId: cId })), skipDuplicates: true });
          }
        }
        if (Array.isArray(updateData.applicableSeriesIds)) {
          // soft-delete existing series bridges
          await tx.promoCodeSeriesBridge.updateMany({ where: { promoCodeId: id, isDeleted: false }, data: { isDeleted: true, deletedAt: new Date() } });
          if (updateData.applicableSeriesIds.length > 0) {
            await tx.promoCodeSeriesBridge.createMany({ data: updateData.applicableSeriesIds.map((sId) => ({ promoCodeId: id, seriesId: sId })), skipDuplicates: true });
          }
        }
        if (Array.isArray(updateData.applicableModelIds)) {
          // soft-delete existing model bridges
          await tx.promoCodeModelBridge.updateMany({ where: { promoCodeId: id, isDeleted: false }, data: { isDeleted: true, deletedAt: new Date() } });
          if (updateData.applicableModelIds.length > 0) {
            await tx.promoCodeModelBridge.createMany({ data: updateData.applicableModelIds.map((mId) => ({ promoCodeId: id, modelId: mId })), skipDuplicates: true });
          }
        }

        return updated;
      });

      return result;
    } catch (err) {
      if (err.code === 'P2025') throw new AppError('Promo code not found', 404);
      throw err;
    }
  }

  async deletePromo(id) {
    try {
      const updated = await prisma.promoCode.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date(), isActive: false }, select: { id: true, isDeleted: true, deletedAt: true } });
      return updated;
    } catch (err) {
      if (err.code === 'P2025') throw new AppError('Promo code not found', 404);
      throw err;
    }
  }

  /**
   * Validate and apply promo code to cart items
   * @param {string} code - Promo code string
   * @param {Array} cartItems - Cart items with product details
   * @param {number} subtotal - Order subtotal before discount
   * @returns {Object} { valid, discount, promoCode, message }
   */
  async validateAndApplyPromoCode(code, cartItems, subtotal) {
    if (!code) {
      return { valid: false, discount: 0, message: 'Promo code is required' };
    }

    // Find promo code (case-insensitive) - use select to reduce data transfer
    const promoCode = await prisma.promoCode.findFirst({
      where: {
        code: { equals: code, mode: 'insensitive' },
        isDeleted: false,
      },
      select: {
        id: true,
        code: true,
        discountType: true,
        discountValue: true,
        minOrderValue: true,
        maxUsageCount: true,
        currentUsageCount: true,
        startDate: true,
        expiryDate: true,
        isActive: true,
        promoCodeSeriesBridge: {
          where: { isDeleted: false },
          select: { seriesId: true },
        },
        promoCodeModelBridge: {
          where: { isDeleted: false },
          select: { modelId: true },
        },
      },
    });

    if (!promoCode) {
      return { valid: false, discount: 0, message: 'Invalid promo code' };
    }

    // Check if active
    if (!promoCode.isActive) {
      return { valid: false, discount: 0, message: 'This promo code is no longer active' };
    }

    // Check date validity
    const now = new Date();
    if (now < new Date(promoCode.startDate)) {
      return { valid: false, discount: 0, message: 'This promo code is not yet valid' };
    }
    if (now > new Date(promoCode.expiryDate)) {
      return { valid: false, discount: 0, message: 'This promo code has expired' };
    }

    // Check usage limit
    if (promoCode.maxUsageCount && promoCode.currentUsageCount >= promoCode.maxUsageCount) {
      return { valid: false, discount: 0, message: 'This promo code has reached its usage limit' };
    }

    // Check minimum order value
    if (promoCode.minOrderValue && subtotal < parseFloat(promoCode.minOrderValue)) {
      return {
        valid: false,
        discount: 0,
        message: `Minimum order value of $${parseFloat(promoCode.minOrderValue).toFixed(2)} required`,
      };
    }

    // Check if promo applies to specific series or models (if bridges exist)
    const seriesIds = promoCode.promoCodeSeriesBridge.map((b) => b.seriesId);
    const modelIds = promoCode.promoCodeModelBridge.map((b) => b.modelId);

    if (seriesIds.length > 0 || modelIds.length > 0) {
      // Promo is restricted to specific series/models
      const hasApplicableItem = cartItems.some((item) => {
        const productSeriesId = item.product?.seriesId;
        const productModelId = item.product?.deviceModelId;
        return (
          (seriesIds.length > 0 && seriesIds.includes(productSeriesId)) ||
          (modelIds.length > 0 && modelIds.includes(productModelId))
        );
      });

      if (!hasApplicableItem) {
        return {
          valid: false,
          discount: 0,
          message: 'This promo code does not apply to items in your cart',
        };
      }

      // Calculate discount only for applicable items
      let applicableSubtotal = 0;
      for (const item of cartItems) {
        const productSeriesId = item.product?.seriesId;
        const productModelId = item.product?.deviceModelId;
        if (
          (seriesIds.length > 0 && seriesIds.includes(productSeriesId)) ||
          (modelIds.length > 0 && modelIds.includes(productModelId))
        ) {
          applicableSubtotal += item.product.basePrice * item.quantity;
        }
      }

      const discount = this.#calculateDiscount(promoCode, applicableSubtotal);
      return {
        valid: true,
        discount,
        promoCode: {
          id: promoCode.id,
          code: promoCode.code,
          discountType: promoCode.discountType,
          discountValue: parseFloat(promoCode.discountValue),
        },
        message: 'Promo code applied successfully',
      };
    }

    // No restrictions, apply to entire order
    const discount = this.#calculateDiscount(promoCode, subtotal);
    return {
      valid: true,
      discount,
      promoCode: {
        id: promoCode.id,
        code: promoCode.code,
        discountType: promoCode.discountType,
        discountValue: parseFloat(promoCode.discountValue),
      },
      message: 'Promo code applied successfully',
    };
  }

  /**
   * Calculate discount amount based on type
   */
  #calculateDiscount(promoCode, subtotal) {
    if (promoCode.discountType === 'PERCENTAGE') {
      const percentage = parseFloat(promoCode.discountValue);
      return (subtotal * percentage) / 100;
    } else if (promoCode.discountType === 'FIXED_AMOUNT') {
      const fixedAmount = parseFloat(promoCode.discountValue);
      // Don't exceed subtotal
      return Math.min(fixedAmount, subtotal);
    }
    return 0;
  }

  /**
   * Increment promo code usage count (called after successful order)
   */
  async incrementUsageCount(promoCodeId) {
    await prisma.promoCode.update({
      where: { id: promoCodeId },
      data: { currentUsageCount: { increment: 1 } },
    });
  }
}

export default new PromoService();
