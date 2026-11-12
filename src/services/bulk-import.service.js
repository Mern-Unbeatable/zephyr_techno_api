import prisma from '../utils/prisma.js';
import AppError from '../utils/app-error.js';
import { formatStorageLabel, syncProductStockTotal } from '../utils/stock.js';
import stockNotificationService from './stock-notification.service.js';

const MAX_ROWS = 10000;

const normalizeName = (value) =>
  String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

const normalizeStorage = (value) => normalizeName(formatStorageLabel(value));

const isBlank = (value) => value === undefined || value === null || String(value).trim() === '';

const parseMoney = (value) => {
  const cleaned = String(value).trim().replace(/[£$,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return NaN;
  return Math.round(Number(cleaned) * 100) / 100;
};

const parseInteger = (value) => {
  const cleaned = String(value).trim().replace(/[,\s]/g, '');
  if (!/^-?\d+$/.test(cleaned)) return NaN;
  return Number(cleaned);
};

const parseYesNo = (value) => {
  const v = normalizeName(value);
  if (['yes', 'y', 'true', '1', 'on', 'enabled'].includes(v)) return true;
  if (['no', 'n', 'false', '0', 'off', 'disabled'].includes(v)) return false;
  return null;
};

const toNumberOrNull = (value) => (value == null ? null : Number(value));

const requireRows = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new AppError('The CSV file has no data rows.', 400);
  }
  if (rows.length > MAX_ROWS) {
    throw new AppError(`The CSV file has too many rows (max ${MAX_ROWS}).`, 400);
  }
};

class BulkImportService {
  #transactionOptions = { timeout: 120000, maxWait: 20000 };

  // ─────────────────────────────────────────────────────────────
  // SELL YOUR PHONE — ConditionModelPrice (model × storage × condition)
  // ─────────────────────────────────────────────────────────────

  /**
   * rows: [{ line, model, storage, prices: { [conditionName]: value } }]
   * Blank price cells are ignored (existing price stays as it is).
   */
  async importConditionModelPrices({ rows, dryRun = true } = {}) {
    requireRows(rows);

    const [models, storages, conditions, existing] = await Promise.all([
      prisma.deviceModel.findMany({ select: { id: true, name: true } }),
      prisma.storageOption.findMany({ select: { id: true, name: true } }),
      prisma.condition.findMany({ select: { id: true, name: true } }),
      prisma.conditionModelPrice.findMany({
        where: { storageOptionId: { not: null } },
        select: {
          id: true,
          conditionId: true,
          deviceModelId: true,
          storageOptionId: true,
          price: true,
          isDeleted: true,
        },
        includeDeleted: true,
      }),
    ]);

    const modelByName = new Map(models.map((m) => [normalizeName(m.name), m]));
    const storageByName = new Map(storages.map((s) => [normalizeStorage(s.name), s]));
    const conditionByName = new Map(conditions.map((c) => [normalizeName(c.name), c]));
    const existingByKey = new Map(
      existing.map((e) => [`${e.conditionId}|${e.deviceModelId}|${e.storageOptionId}`, e]),
    );

    const errors = [];
    const changes = [];
    const seen = new Map();
    const unknownConditions = new Set();
    let unchanged = 0;

    for (const row of rows) {
      const line = row?.line ?? null;
      const modelName = String(row?.model ?? '').trim();
      const storageName = String(row?.storage ?? '').trim();
      const prices = row?.prices && typeof row.prices === 'object' ? row.prices : {};

      const filledEntries = Object.entries(prices).filter(([, value]) => !isBlank(value));
      if (!modelName && !storageName && filledEntries.length === 0) continue;

      if (!modelName) {
        errors.push({ line, message: 'Model is empty.' });
        continue;
      }
      if (!storageName) {
        errors.push({ line, message: `Storage is empty for "${modelName}".` });
        continue;
      }

      const model = modelByName.get(normalizeName(modelName));
      if (!model) {
        errors.push({
          line,
          message: `Model "${modelName}" was not found. Add it in Settings first or check the spelling.`,
        });
        continue;
      }

      const storage = storageByName.get(normalizeStorage(storageName));
      if (!storage) {
        errors.push({
          line,
          message: `Storage "${storageName}" was not found. Add it in Settings first or check the spelling.`,
        });
        continue;
      }

      for (const [conditionName, rawValue] of filledEntries) {
        const condition = conditionByName.get(normalizeName(conditionName));
        if (!condition) {
          unknownConditions.add(String(conditionName).trim());
          continue;
        }

        const price = parseMoney(rawValue);
        if (!Number.isFinite(price) || price < 0) {
          errors.push({
            line,
            message: `Invalid price "${rawValue}" for ${model.name} ${formatStorageLabel(storage.name)} / ${condition.name}.`,
          });
          continue;
        }

        const key = `${condition.id}|${model.id}|${storage.id}`;
        if (seen.has(key)) {
          errors.push({
            line,
            message: `Duplicate row: ${model.name} ${formatStorageLabel(storage.name)} / ${condition.name} already appears on line ${seen.get(key)}.`,
          });
          continue;
        }
        seen.set(key, line);

        const current = existingByKey.get(key);
        const oldPrice = current && !current.isDeleted ? Number(current.price) : null;

        if (oldPrice != null && Math.abs(oldPrice - price) < 0.005) {
          unchanged += 1;
          continue;
        }

        changes.push({
          line,
          action: oldPrice == null ? 'create' : 'update',
          existingId: current?.id ?? null,
          restore: Boolean(current?.isDeleted),
          conditionId: condition.id,
          deviceModelId: model.id,
          storageOptionId: storage.id,
          model: model.name,
          storage: formatStorageLabel(storage.name),
          condition: condition.name,
          oldPrice,
          newPrice: price,
        });
      }
    }

    if (unknownConditions.size > 0) {
      errors.unshift({
        line: 1,
        message: `Unknown condition column(s): ${[...unknownConditions].join(', ')}. Column names must match the conditions in Settings.`,
      });
    }

    if (!dryRun && changes.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const change of changes) {
          if (change.existingId) {
            await tx.conditionModelPrice.update({
              where: { id: change.existingId },
              data: {
                price: change.newPrice,
                ...(change.restore ? { isDeleted: false, deletedAt: null } : {}),
              },
            });
          } else {
            await tx.conditionModelPrice.create({
              data: {
                conditionId: change.conditionId,
                deviceModelId: change.deviceModelId,
                storageOptionId: change.storageOptionId,
                price: change.newPrice,
              },
            });
          }
        }
      }, this.#transactionOptions);
    }

    return {
      applied: !dryRun,
      summary: {
        created: changes.filter((c) => c.action === 'create').length,
        updated: changes.filter((c) => c.action === 'update').length,
        unchanged,
        errors: errors.length,
      },
      changes: changes.map(({ line, action, model, storage, condition, oldPrice, newPrice }) => ({
        line,
        action,
        model,
        storage,
        condition,
        oldPrice,
        newPrice,
      })),
      errors,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // SHOP PRODUCTS — ProductVariantStock (condition × colour × storage)
  // ─────────────────────────────────────────────────────────────

  async exportProductVariants() {
    const products = await prisma.product.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        listingStatus: true,
        deviceModel: { select: { name: true } },
        variantStocks: {
          select: {
            id: true,
            stockQuantity: true,
            price: true,
            compareAtPrice: true,
            expressDeliveryEnabled: true,
            conditionCategory: { select: { name: true } },
            color: { select: { name: true } },
            storageOption: { select: { name: true } },
          },
        },
      },
    });

    const rows = [];
    for (const product of products) {
      const variants = [...product.variantStocks].sort((a, b) => {
        const byCondition = String(a.conditionCategory?.name || '').localeCompare(
          String(b.conditionCategory?.name || ''),
        );
        if (byCondition !== 0) return byCondition;
        const byColor = String(a.color?.name || '').localeCompare(String(b.color?.name || ''));
        if (byColor !== 0) return byColor;
        return String(a.storageOption?.name || '').localeCompare(
          String(b.storageOption?.name || ''),
          undefined,
          { numeric: true },
        );
      });

      for (const variant of variants) {
        rows.push({
          variantId: variant.id,
          productId: product.id,
          product: product.title,
          model: product.deviceModel?.name || '',
          status: product.listingStatus,
          condition: variant.conditionCategory?.name || '',
          color: variant.color?.name || '',
          storage: formatStorageLabel(variant.storageOption?.name || ''),
          price: toNumberOrNull(variant.price),
          compareAtPrice: toNumberOrNull(variant.compareAtPrice),
          stockQuantity: Number(variant.stockQuantity) || 0,
          expressDeliveryEnabled: variant.expressDeliveryEnabled !== false,
        });
      }
    }

    return rows;
  }

  /**
   * rows: [{ line, variantId, price, compareAtPrice, stockQuantity, expressDeliveryEnabled }]
   * Rows are matched by Variant ID. Blank cells keep the current value.
   * Compare At Price of 0 clears it.
   */
  async importProductVariants({ rows, dryRun = true } = {}) {
    requireRows(rows);

    const ids = [
      ...new Set(
        rows
          .map((row) => String(row?.variantId ?? '').trim())
          .filter(Boolean),
      ),
    ];

    const variants = ids.length
      ? await prisma.productVariantStock.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            productId: true,
            colorId: true,
            storageOptionId: true,
            conditionCategoryId: true,
            stockQuantity: true,
            price: true,
            compareAtPrice: true,
            expressDeliveryEnabled: true,
            product: {
              select: {
                title: true,
                isDeleted: true,
                listingStatus: true,
                deviceModel: { select: { name: true } },
              },
            },
            conditionCategory: { select: { name: true } },
            color: { select: { name: true } },
            storageOption: { select: { name: true } },
          },
        })
      : [];
    const variantById = new Map(variants.map((v) => [v.id, v]));

    const errors = [];
    const warnings = [];
    const changes = [];
    const seen = new Map();
    let unchanged = 0;

    for (const row of rows) {
      const line = row?.line ?? null;
      const variantId = String(row?.variantId ?? '').trim();
      const hasValues = ['price', 'compareAtPrice', 'stockQuantity', 'expressDeliveryEnabled'].some(
        (field) => !isBlank(row?.[field]),
      );

      if (!variantId) {
        if (hasValues) {
          errors.push({
            line,
            message: 'Variant ID is missing. New variants must be added from the listing edit page.',
          });
        }
        continue;
      }

      const variant = variantById.get(variantId);
      if (!variant || variant.product?.isDeleted) {
        errors.push({ line, message: `Variant ID "${variantId}" was not found.` });
        continue;
      }

      if (seen.has(variantId)) {
        errors.push({
          line,
          message: `Duplicate Variant ID — this variant already appears on line ${seen.get(variantId)}.`,
        });
        continue;
      }
      seen.set(variantId, line);

      const ignoredEdits = this.#readOnlyEdits(row, variant);
      if (ignoredEdits.length) {
        warnings.push({
          line,
          message: `${ignoredEdits.join(', ')} changed but not saved — edit ${ignoredEdits.length === 1 ? 'this' : 'these'} from the listing's Edit page.`,
        });
      }

      const label = [
        variant.product?.title,
        variant.conditionCategory?.name,
        variant.color?.name,
        formatStorageLabel(variant.storageOption?.name || ''),
      ]
        .filter(Boolean)
        .join(' · ');

      const data = {};
      const diff = {};
      let rowHasError = false;

      if (!isBlank(row.price)) {
        const price = parseMoney(row.price);
        if (!Number.isFinite(price) || price <= 0) {
          errors.push({ line, message: `Invalid price "${row.price}" for ${label}. Price must be greater than 0.` });
          rowHasError = true;
        } else if (Math.abs((Number(variant.price) || 0) - price) >= 0.005) {
          data.price = price;
          diff.price = { from: toNumberOrNull(variant.price), to: price };
        }
      }

      if (!isBlank(row.compareAtPrice)) {
        const compareAt = parseMoney(row.compareAtPrice);
        if (!Number.isFinite(compareAt) || compareAt < 0) {
          errors.push({ line, message: `Invalid compare-at price "${row.compareAtPrice}" for ${label}.` });
          rowHasError = true;
        } else {
          const next = compareAt === 0 ? null : compareAt;
          const current = toNumberOrNull(variant.compareAtPrice);
          const same =
            (next == null && current == null) ||
            (next != null && current != null && Math.abs(next - current) < 0.005);
          if (!same) {
            data.compareAtPrice = next;
            diff.compareAtPrice = { from: current, to: next };
          }
        }
      }

      if (!isBlank(row.stockQuantity)) {
        const stock = parseInteger(row.stockQuantity);
        if (!Number.isInteger(stock) || stock < 0) {
          errors.push({ line, message: `Invalid stock "${row.stockQuantity}" for ${label}. Use a whole number of 0 or more.` });
          rowHasError = true;
        } else if (stock !== (Number(variant.stockQuantity) || 0)) {
          data.stockQuantity = stock;
          diff.stockQuantity = { from: Number(variant.stockQuantity) || 0, to: stock };
        }
      }

      if (!isBlank(row.expressDeliveryEnabled)) {
        const express = parseYesNo(row.expressDeliveryEnabled);
        if (express == null) {
          errors.push({
            line,
            message: `Invalid Express Delivery value "${row.expressDeliveryEnabled}" for ${label}. Use Yes or No.`,
          });
          rowHasError = true;
        } else if (express !== (variant.expressDeliveryEnabled !== false)) {
          data.expressDeliveryEnabled = express;
          diff.expressDeliveryEnabled = { from: variant.expressDeliveryEnabled !== false, to: express };
        }
      }

      if (rowHasError) continue;

      if (Object.keys(data).length === 0) {
        unchanged += 1;
        continue;
      }

      changes.push({
        line,
        variantId,
        productId: variant.productId,
        restocked: data.stockQuantity > 0 && (Number(variant.stockQuantity) || 0) <= 0,
        variant,
        label,
        data,
        diff,
      });
    }

    if (!dryRun && changes.length > 0) {
      const byProduct = new Map();
      for (const change of changes) {
        if (!byProduct.has(change.productId)) byProduct.set(change.productId, []);
        byProduct.get(change.productId).push(change);
      }

      await prisma.$transaction(async (tx) => {
        for (const change of changes) {
          await tx.productVariantStock.update({
            where: { id: change.variantId },
            data: change.data,
          });
        }

        for (const productId of byProduct.keys()) {
          await syncProductStockTotal(tx, productId);

          const cheapest = await tx.productVariantStock.aggregate({
            where: { productId, price: { gt: 0 } },
            _min: { price: true },
          });
          if (cheapest._min.price != null) {
            await tx.product.update({
              where: { id: productId },
              data: { basePrice: cheapest._min.price },
            });
          }
        }
      }, this.#transactionOptions);

      for (const [productId, productChanges] of byProduct.entries()) {
        const restocked = productChanges
          .filter((change) => change.restocked)
          .map((change) => ({
            colorId: change.variant.colorId,
            storageOptionId: change.variant.storageOptionId,
            conditionCategoryId: change.variant.conditionCategoryId || null,
          }));
        if (restocked.length) {
          stockNotificationService
            .notifyRestockedVariants(productId, restocked)
            .catch((err) => console.error('[StockNotification] Restock notify failed:', err));
        }
      }
    }

    return {
      applied: !dryRun,
      summary: {
        updated: changes.length,
        products: new Set(changes.map((c) => c.productId)).size,
        unchanged,
        errors: errors.length,
      },
      changes: changes.map(({ line, variantId, label, diff }) => ({ line, variantId, label, diff })),
      errors,
      warnings,
    };
  }

  /** Read-only CSV columns the user edited (only checked when the column was sent). */
  #readOnlyEdits(row, variant) {
    const statusLabel = variant.product?.listingStatus === 'ACTIVE' ? 'active' : 'inactive';
    const checks = [
      ['Product', row.product, variant.product?.title],
      ['Model', row.model, variant.product?.deviceModel?.name],
      ['Status', row.status, statusLabel],
      ['Condition', row.condition, variant.conditionCategory?.name || ''],
      ['Colour', row.color, variant.color?.name],
      ['Storage', row.storage, formatStorageLabel(variant.storageOption?.name || '')],
    ];

    return checks
      .filter(([, sent]) => sent !== undefined)
      .filter(([label, sent, actual]) => {
        const a = label === 'Storage' ? normalizeStorage(sent) : normalizeName(sent);
        const b = label === 'Storage' ? normalizeStorage(actual) : normalizeName(actual);
        return a !== b;
      })
      .map(([label]) => label);
  }
}

export default new BulkImportService();
