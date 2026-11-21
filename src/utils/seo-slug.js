/**
 * Shared SEO slug helpers for product variants and sell-model pages.
 */

const BRAND_RULES = [
  { test: /(iphone|ipad|\bapple\b)/i, brand: 'Apple' },
  { test: /(samsung|galaxy)/i, brand: 'Samsung' },
  { test: /(google|pixel)/i, brand: 'Google' },
  { test: /(xiaomi|redmi)/i, brand: 'Xiaomi' },
  { test: /(oneplus)/i, brand: 'OnePlus' },
  { test: /(huawei)/i, brand: 'Huawei' },
  { test: /(sony|xperia)/i, brand: 'Sony' },
  { test: /(motorola|moto\b)/i, brand: 'Motorola' },
];

export function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function inferBrand({ title, seriesName, modelName } = {}) {
  const haystack = [title, seriesName, modelName].filter(Boolean).join(' ');
  for (const rule of BRAND_RULES) {
    if (rule.test.test(haystack)) return rule.brand;
  }
  if (seriesName && !/iphone|phone|series/i.test(seriesName)) return seriesName;
  const first = String(title || modelName || '')
    .trim()
    .split(/\s+/)[0];
  return first || 'Phone';
}

export function buildVariantDescriptiveSlug({
  brand,
  model,
  colour,
  storage,
  condition,
} = {}) {
  const parts = [brand, model, colour, storage, condition]
    .map((part) => slugify(part))
    .filter(Boolean);
  return parts.join('-') || 'phone';
}

/** Canonical product variant slug: descriptive--{variantStockId} */
export function buildVariantSeoSlug(parts, variantStockId) {
  const descriptive = buildVariantDescriptiveSlug(parts);
  const id = String(variantStockId || '').trim();
  if (!id) return descriptive;
  return `${descriptive}--${id}`;
}

export function parseVariantSeoSlug(slug) {
  const raw = String(slug || '').trim();
  if (!raw) return { descriptive: '', variantStockId: null };
  const idx = raw.lastIndexOf('--');
  if (idx === -1) return { descriptive: raw, variantStockId: null };
  return {
    descriptive: raw.slice(0, idx),
    variantStockId: raw.slice(idx + 2) || null,
  };
}

export function buildSellModelSlug({ brand, model } = {}) {
  return [brand, model].map((p) => slugify(p)).filter(Boolean).join('-') || 'phone';
}

export function formatGbp(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

export function stockStatusLabel(stockQuantity) {
  return Number(stockQuantity) > 0 ? 'In stock' : 'Out of stock';
}

export function truncateMeta(text, max = 155) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}…`;
}

export function truncateTitle(text, max = 60) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}…`;
}
