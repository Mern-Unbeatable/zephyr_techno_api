import prisma from '../utils/prisma.js';
import AppError from '../utils/app-error.js';
import Mailer from '../utils/mailer.js';
import { formatStorageLabel } from '../utils/stock.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class StockNotificationService {
  constructor(mailer = new Mailer()) {
    this.mailer = mailer;
  }

  #normalizeEmail(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) {
      throw new AppError('Email is required.', 400);
    }
    if (!EMAIL_REGEX.test(normalized)) {
      throw new AppError('Please provide a valid email address.', 400);
    }
    return normalized;
  }

  async #assertVariantBelongsToProduct(productId, colorId, storageOptionId) {
    const product = await prisma.product.findFirst({
      where: { id: productId, isDeleted: false },
      select: {
        id: true,
        title: true,
        stockQuantity: true,
        colors: {
          where: { colorId, isDeleted: false },
          select: { stockQuantity: true },
        },
        storageOptions: {
          where: { storageOptionId, isDeleted: false },
          select: { stockQuantity: true },
        },
        variantStocks: {
          where: { colorId, storageOptionId },
          select: { stockQuantity: true },
        },
      },
    });

    if (!product) {
      throw new AppError('Product not found.', 404);
    }
    if (!product.colors.length) {
      throw new AppError('Selected color is not available for this product.', 400);
    }
    if (!product.storageOptions.length) {
      throw new AppError('Selected storage is not available for this product.', 400);
    }

    const variantBridge = product.variantStocks[0] || null;
    const colorBridge = product.colors[0] || null;
    const storageBridge = product.storageOptions[0] || null;
    const stock = variantBridge
      ? Math.max(0, Number(variantBridge.stockQuantity) || 0)
      : Math.min(
          Math.max(0, Number(colorBridge?.stockQuantity) || 0),
          Math.max(0, Number(storageBridge?.stockQuantity) || 0),
        );

    if (stock > 0) {
      throw new AppError('This variant is already in stock.', 400);
    }

    return product;
  }

  async subscribe({ productId, colorId, storageOptionId, email, userId = null }) {
    if (!productId || !colorId || !storageOptionId) {
      throw new AppError('Product, color, and storage are required.', 400);
    }

    const normalizedEmail = this.#normalizeEmail(email);
    await this.#assertVariantBelongsToProduct(productId, colorId, storageOptionId);

    const notification = await prisma.stockNotification.upsert({
      where: {
        productId_colorId_storageOptionId_email: {
          productId,
          colorId,
          storageOptionId,
          email: normalizedEmail,
        },
      },
      create: {
        productId,
        colorId,
        storageOptionId,
        email: normalizedEmail,
        userId: userId || null,
      },
      update: {
        userId: userId || null,
        notifiedAt: null,
      },
      include: {
        product: { select: { id: true, title: true } },
        color: { select: { id: true, name: true } },
        storageOption: { select: { id: true, name: true } },
      },
    });

    return this.#formatNotification(notification);
  }

  async getAllForAdmin(query = {}) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Number(query.limit) || 20, 100);
    const skip = (page - 1) * limit;
    const status = String(query.status || '').toUpperCase();

    const where = {};
    if (status === 'PENDING') where.notifiedAt = null;
    if (status === 'NOTIFIED') where.notifiedAt = { not: null };

    const [total, rows] = await Promise.all([
      prisma.stockNotification.count({ where }),
      prisma.stockNotification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          product: {
            select: {
              id: true,
              title: true,
              deviceModel: { select: { name: true } },
            },
          },
          color: { select: { id: true, name: true } },
          storageOption: { select: { id: true, name: true } },
        },
      }),
    ]);

    return {
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
      data: rows.map((row) => this.#formatNotification(row)),
    };
  }

  async notifyRestockedVariants(productId, variants = []) {
    if (!variants.length) return;

    for (const variant of variants) {
      const { colorId, storageOptionId } = variant;
      const pending = await prisma.stockNotification.findMany({
        where: {
          productId,
          colorId,
          storageOptionId,
          notifiedAt: null,
        },
        include: {
          product: { select: { id: true, title: true } },
          color: { select: { id: true, name: true } },
          storageOption: { select: { id: true, name: true } },
        },
      });

      if (!pending.length) continue;

      const notifiedAt = new Date();
      await Promise.all(
        pending.map(async (notification) => {
          try {
            await this.mailer.sendBackInStockNotification({ notification });
            await prisma.stockNotification.update({
              where: { id: notification.id },
              data: { notifiedAt },
            });
          } catch (err) {
            console.error('[StockNotification] Failed to send back-in-stock email:', err);
          }
        }),
      );
    }
  }

  #formatNotification(row) {
    return {
      id: row.id,
      email: row.email,
      status: row.notifiedAt ? 'NOTIFIED' : 'PENDING',
      notifiedAt: row.notifiedAt,
      createdAt: row.createdAt,
      product: row.product
        ? {
            id: row.product.id,
            title: row.product.title,
            model: row.product.deviceModel?.name || null,
          }
        : null,
      color: row.color ? { id: row.color.id, name: row.color.name } : null,
      storage: row.storageOption
        ? { id: row.storageOption.id, name: formatStorageLabel(row.storageOption.name) }
        : null,
    };
  }
}

export default new StockNotificationService();
