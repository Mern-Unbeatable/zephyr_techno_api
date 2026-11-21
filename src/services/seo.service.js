import prisma from '../utils/prisma.js';
import env from '../config/env.js';
import { formatStorageLabel } from '../utils/stock.js';
import {
  buildSellModelSlug,
  buildVariantSeoSlug,
  formatGbp,
  inferBrand,
  parseVariantSeoSlug,
  stockStatusLabel,
  truncateMeta,
  truncateTitle,
} from '../utils/seo-slug.js';

const SITE_NAME = 'Zephyr Technology';
const DEFAULT_OG_IMAGE = '/og-default.webp';

const absoluteUrl = (path = '/') => {
  const base = String(env.frontendUrl || 'https://www.zephyrtechnology.co.uk').replace(/\/$/, '');
  if (!path || path === '/') return `${base}/`;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
};

const mediaUrl = (imageUrl) => {
  if (!imageUrl) return absoluteUrl(DEFAULT_OG_IMAGE);
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  const apiBase = String(process.env.LIVE_URL || process.env.SIGNATURE_IMAGE_BASE_URL || '')
    .replace(/\/$/, '');
  if (apiBase) {
    return `${apiBase}/${String(imageUrl).replace(/^\/+/, '')}`;
  }
  return absoluteUrl(DEFAULT_OG_IMAGE);
};

function variantParts(product, color, storage, condition) {
  const brand = inferBrand({
    title: product.title,
    seriesName: product.series?.name,
    modelName: product.deviceModel?.name,
  });
  const model = product.deviceModel?.name || product.title;
  return {
    brand,
    model,
    colour: color?.name || null,
    storage: storage?.name ? formatStorageLabel(storage.name) : null,
    condition: condition?.name || null,
  };
}

function buildProductMeta(parts, price, stockQuantity, path) {
  const nameBits = [parts.brand, parts.model, parts.storage, parts.colour]
    .filter(Boolean)
    .join(' ');
  const title = truncateTitle(`${nameBits} | ${SITE_NAME}`);
  const priceText = formatGbp(price);
  const stock = stockStatusLabel(stockQuantity);
  const descCore = [
    `Buy the ${[parts.brand, parts.model, parts.storage].filter(Boolean).join(' ')}`,
    parts.colour ? `in ${parts.colour}` : null,
    priceText ? `for ${priceText}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  const description = truncateMeta(
    `${descCore}. ${stock} with fast UK delivery and secure checkout from ${SITE_NAME}.`,
  );
  const h1 = [parts.brand, parts.model, parts.storage, parts.colour].filter(Boolean).join(' ');
  const imageAlt = [parts.brand, parts.model, parts.colour ? `in ${parts.colour}` : null]
    .filter(Boolean)
    .join(' ');
  const mainKeyword = `buy ${parts.model}`.trim();
  const supportingKeywords = [
    parts.model && parts.storage ? `${parts.model} ${parts.storage}` : null,
    parts.model && parts.colour ? `${parts.model} ${parts.colour}` : null,
  ].filter(Boolean);
  const opening = [
    `Looking to ${mainKeyword}?`,
    supportingKeywords.length
      ? `This ${supportingKeywords.join(' / ')} is available from ${SITE_NAME}`
      : null,
    'with secure checkout and fast UK delivery.',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    title,
    description,
    h1,
    imageAlt,
    canonical: absoluteUrl(path),
    ogType: 'product',
    mainKeyword,
    supportingKeywords,
    opening,
  };
}

function buildStaticPageMeta(key, pathOverride) {
  const pages = {
    home: {
      title: truncateTitle(`Buy & Sell Phones in the UK | ${SITE_NAME}`),
      description: truncateMeta(
        `Buy new and used phones at great prices, or sell your old phone in minutes. Genuine, checked devices with fast UK delivery from ${SITE_NAME}.`,
      ),
      h1: 'Buy & Sell Phones in the UK',
      path: '/',
      mainKeyword: 'buy and sell phones UK',
      supportingKeywords: [
        'new and used phones UK',
        'smartphone deals UK',
        'buy smartphones online UK',
        'Zephyr Technology',
      ],
      opening:
        'Buy and sell phones UK shoppers trust Zephyr Technology for new and used phones UK, smartphone deals UK, and a simple way to buy smartphones online UK.',
    },
    phonesNew: {
      title: truncateTitle(`Buy New iPhones & Phones UK | ${SITE_NAME}`),
      description: truncateMeta(
        `Shop new iPhones and phones from ${SITE_NAME}. Genuine devices, secure checkout and fast UK delivery.`,
      ),
      h1: 'Buy New iPhones & Phones UK',
      path: '/phones/new',
      mainKeyword: 'buy new iPhone',
      supportingKeywords: ['buy iPhone UK'],
      opening:
        'Buy new iPhone models and other new phones from Zephyr Technology. Browse buy iPhone UK deals with genuine devices, secure checkout and fast UK delivery.',
    },
    phonesUsed: {
      title: truncateTitle(`Buy Used iPhones & Phones UK | ${SITE_NAME}`),
      description: truncateMeta(
        `Shop used iPhones and phones that have been professionally checked. Great prices, secure checkout and fast UK delivery from ${SITE_NAME}.`,
      ),
      h1: 'Buy Used iPhones & Phones UK',
      path: '/phones/used',
      mainKeyword: 'buy used iPhone',
      supportingKeywords: ['buy iPhone UK'],
      opening:
        'Buy used iPhone and other checked devices at Zephyr Technology. Find buy iPhone UK options that are professionally inspected, with secure checkout and fast UK delivery.',
    },
    sellHub: {
      title: truncateTitle(`Sell Your iPhone & Phone Online UK | ${SITE_NAME}`),
      description: truncateMeta(
        `Sell your iPhone or old phone in minutes with ${SITE_NAME}. Competitive market rates and a simple, seamless process.`,
      ),
      h1: 'Sell Your iPhone & Phone Online UK',
      path: '/sell-your-phone',
      mainKeyword: 'sell my iPhone',
      supportingKeywords: [
        'sell iPhone UK',
        'sell my phone',
        'sell used iPhone',
        'sell iPhone online',
        'iPhone trade in',
      ],
      opening:
        'Sell my iPhone or sell my phone with Zephyr Technology — get a fast iPhone trade in, sell iPhone UK quotes, sell used iPhone offers, and sell iPhone online in minutes.',
    },
  };

  const page = pages[key];
  if (!page) return null;
  const path = pathOverride || page.path;
  return {
    ...page,
    canonical: absoluteUrl(path),
    ogType: 'website',
    image: absoluteUrl(DEFAULT_OG_IMAGE),
    imageAlt: page.h1 || SITE_NAME,
  };
}

class SeoService {
  getOrganizationSchema() {
    return {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE_NAME,
      url: absoluteUrl('/'),
      logo: absoluteUrl(DEFAULT_OG_IMAGE),
    };
  }

  getWebSiteSchema() {
    return {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      url: absoluteUrl('/'),
      potentialAction: {
        '@type': 'SearchAction',
        target: `${absoluteUrl('/phones/new')}?search={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    };
  }

  async getStaticMeta(pageKey, { page } = {}) {
    if (pageKey === 'phonesNew' || pageKey === 'phonesUsed') {
      const pageNum = Math.max(1, Number(page) || 1);
      const basePath = pageKey === 'phonesNew' ? '/phones/new' : '/phones/used';
      const path = pageNum > 1 ? `${basePath}?page=${pageNum}` : basePath;
      const meta = buildStaticPageMeta(pageKey, path);
      return {
        ...meta,
        jsonLd: [],
      };
    }

    if (pageKey === 'home') {
      const meta = buildStaticPageMeta('home');
      return {
        ...meta,
        jsonLd: [this.getOrganizationSchema(), this.getWebSiteSchema()],
      };
    }

    if (pageKey === 'sellHub') {
      return { ...buildStaticPageMeta('sellHub'), jsonLd: [] };
    }

    return null;
  }

  #mapVariantRow(row) {
    const parts = variantParts(
      row.product,
      row.color,
      row.storageOption,
      row.conditionCategory,
    );
    const slug = buildVariantSeoSlug(parts, row.id);
    const path = `/phones/${slug}`;
    const price =
      row.price != null
        ? Number(row.price)
        : row.product.basePrice != null
          ? Number(row.product.basePrice)
          : null;
    const stockQuantity = row.stockQuantity ?? 0;
    const meta = buildProductMeta(parts, price, stockQuantity, path);
    const image =
      row.product.productGalleries?.find((g) => g.colorId === row.colorId)?.imageUrl ||
      row.product.productGalleries?.[0]?.imageUrl ||
      null;

    return {
      slug,
      path,
      productId: row.productId,
      variantStockId: row.id,
      colorId: row.colorId,
      storageOptionId: row.storageOptionId,
      conditionCategoryId: row.conditionCategoryId || null,
      brand: parts.brand,
      model: parts.model,
      colour: parts.colour,
      storage: parts.storage,
      condition: parts.condition,
      price,
      stockQuantity,
      availability: stockQuantity > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      image: mediaUrl(image),
      updatedAt: row.product.updatedAt,
      ...meta,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: meta.h1,
          image: [mediaUrl(image)],
          description: meta.description,
          brand: { '@type': 'Brand', name: parts.brand },
          sku: row.id,
          offers: {
            '@type': 'Offer',
            url: absoluteUrl(path),
            priceCurrency: 'GBP',
            price: price != null ? String(price) : undefined,
            availability:
              stockQuantity > 0
                ? 'https://schema.org/InStock'
                : 'https://schema.org/OutOfStock',
            itemCondition: 'https://schema.org/NewCondition',
            seller: { '@type': 'Organization', name: SITE_NAME },
          },
        },
      ],
    };
  }

  async resolveProductBySlug(slug) {
    const { variantStockId } = parseVariantSeoSlug(slug);
    if (!variantStockId) return null;

    const row = await prisma.productVariantStock.findFirst({
      where: {
        id: variantStockId,
        product: { listingStatus: 'ACTIVE' },
      },
      include: {
        color: true,
        storageOption: true,
        conditionCategory: true,
        product: {
          include: {
            series: true,
            deviceModel: true,
            productGalleries: {
              orderBy: { displayOrder: 'asc' },
              take: 12,
            },
          },
        },
      },
    });

    if (!row) return null;
    return this.#mapVariantRow(row);
  }

  async resolveProductCanonical({
    productId,
    colorId,
    storageOptionId,
    conditionCategoryId,
  }) {
    if (!productId) return null;

    const where = {
      productId,
      product: { listingStatus: 'ACTIVE' },
    };
    if (colorId) where.colorId = colorId;
    if (storageOptionId) where.storageOptionId = storageOptionId;
    if (conditionCategoryId) {
      where.conditionCategoryId = conditionCategoryId;
    } else if (conditionCategoryId === null) {
      where.OR = [{ conditionCategoryId: null }, { conditionKey: '' }];
    }

    let row = await prisma.productVariantStock.findFirst({
      where,
      include: {
        color: true,
        storageOption: true,
        conditionCategory: true,
        product: {
          include: {
            series: true,
            deviceModel: true,
            productGalleries: {
              orderBy: { displayOrder: 'asc' },
              take: 12,
            },
          },
        },
      },
      orderBy: [{ stockQuantity: 'desc' }],
    });

    if (!row) {
      row = await prisma.productVariantStock.findFirst({
        where: { productId, product: { listingStatus: 'ACTIVE' } },
        include: {
          color: true,
          storageOption: true,
          conditionCategory: true,
          product: {
            include: {
              series: true,
              deviceModel: true,
              productGalleries: {
                orderBy: { displayOrder: 'asc' },
                take: 12,
              },
            },
          },
        },
        orderBy: [{ stockQuantity: 'desc' }],
      });
    }

    if (!row) return null;
    return this.#mapVariantRow(row);
  }

  async listProductVariantsForSitemap() {
    const rows = await prisma.productVariantStock.findMany({
      where: { product: { listingStatus: 'ACTIVE' } },
      include: {
        color: true,
        storageOption: true,
        conditionCategory: true,
        product: {
          select: {
            id: true,
            title: true,
            updatedAt: true,
            basePrice: true,
            series: { select: { name: true } },
            deviceModel: { select: { name: true } },
            productGalleries: {
              orderBy: { displayOrder: 'asc' },
              take: 1,
              select: { imageUrl: true, colorId: true },
            },
          },
        },
      },
      orderBy: { product: { updatedAt: 'desc' } },
    });

    return rows.map((row) => this.#mapVariantRow(row));
  }

  async resolveSellModelBySlug(slug) {
    const models = await prisma.deviceModel.findMany({
      include: { series: true },
      orderBy: { name: 'asc' },
    });

    const match = models.find((model) => {
      const brand = inferBrand({
        seriesName: model.series?.name,
        modelName: model.name,
      });
      return buildSellModelSlug({ brand, model: model.name }) === slug;
    });

    if (!match) return null;

    const brand = inferBrand({
      seriesName: match.series?.name,
      modelName: match.name,
    });
    const path = `/sell-your-phone/${slug}`;
    const title = truncateTitle(`Sell Your ${brand} ${match.name} | ${SITE_NAME}`);
    const description = truncateMeta(
      `Sell your ${brand} ${match.name} in minutes with ${SITE_NAME}. Competitive market rates and a seamless process.`,
    );

    return {
      slug,
      path,
      deviceModelId: match.id,
      seriesId: match.seriesId,
      seriesName: match.series?.name || null,
      brand,
      model: match.name,
      title,
      description,
      h1: `Sell Your ${brand} ${match.name}`,
      canonical: absoluteUrl(path),
      ogType: 'website',
      image: absoluteUrl(DEFAULT_OG_IMAGE),
      imageAlt: `Sell ${brand} ${match.name}`,
      mainKeyword: `sell ${match.name}`,
      jsonLd: [],
    };
  }

  async listSellModelsForSitemap() {
    const models = await prisma.deviceModel.findMany({
      include: { series: true },
      orderBy: { name: 'asc' },
    });

    return models.map((model) => {
      const brand = inferBrand({
        seriesName: model.series?.name,
        modelName: model.name,
      });
      const slug = buildSellModelSlug({ brand, model: model.name });
      return {
        slug,
        path: `/sell-your-phone/${slug}`,
        deviceModelId: model.id,
        updatedAt: model.createdAt,
        brand,
        model: model.name,
      };
    });
  }

  async getMetaForPath(pathname, query = {}) {
    const path = String(pathname || '/').split('?')[0] || '/';

    if (path === '/' || path === '') {
      return this.getStaticMeta('home');
    }

    if (path === '/phones/new' || path === '/products') {
      return this.getStaticMeta('phonesNew', { page: query.page });
    }

    if (path === '/phones/used') {
      return this.getStaticMeta('phonesUsed', { page: query.page });
    }

    if (path === '/sell-your-phone' || path === '/sell') {
      return this.getStaticMeta('sellHub');
    }

    const phoneMatch = path.match(/^\/phones\/([^/]+)\/?$/);
    if (phoneMatch && !['new', 'used'].includes(phoneMatch[1])) {
      const resolved = await this.resolveProductBySlug(decodeURIComponent(phoneMatch[1]));
      return resolved;
    }

    const sellMatch = path.match(/^\/sell-your-phone\/([^/]+)\/?$/);
    if (sellMatch) {
      return this.resolveSellModelBySlug(decodeURIComponent(sellMatch[1]));
    }

    return null;
  }

  async buildSitemapXml() {
    const baseUrl = String(env.frontendUrl).replace(/\/$/, '');
    const escapeXml = (value) =>
      String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    const staticUrls = [
      { loc: `${baseUrl}/`, changefreq: 'daily', priority: '1.0' },
      { loc: `${baseUrl}/phones/new`, changefreq: 'daily', priority: '0.9' },
      { loc: `${baseUrl}/phones/used`, changefreq: 'daily', priority: '0.9' },
      { loc: `${baseUrl}/sell-your-phone`, changefreq: 'weekly', priority: '0.9' },
      { loc: `${baseUrl}/for-businesses`, changefreq: 'monthly', priority: '0.7' },
      { loc: `${baseUrl}/about-us`, changefreq: 'monthly', priority: '0.6' },
      { loc: `${baseUrl}/contact`, changefreq: 'monthly', priority: '0.6' },
      { loc: `${baseUrl}/track-request`, changefreq: 'monthly', priority: '0.4' },
      { loc: `${baseUrl}/terms-condition`, changefreq: 'yearly', priority: '0.3' },
      { loc: `${baseUrl}/sell-terms-condition`, changefreq: 'yearly', priority: '0.3' },
      { loc: `${baseUrl}/privacy-policy`, changefreq: 'yearly', priority: '0.3' },
      { loc: `${baseUrl}/refund-policy`, changefreq: 'yearly', priority: '0.3' },
      { loc: `${baseUrl}/shipping-policy`, changefreq: 'yearly', priority: '0.3' },
    ];

    const [variants, sellModels] = await Promise.all([
      this.listProductVariantsForSitemap(),
      this.listSellModelsForSitemap(),
    ]);

    const urls = [
      ...staticUrls.map(
        (u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
      ),
      ...variants.map(
        (v) => `  <url>
    <loc>${escapeXml(`${baseUrl}${v.path}`)}</loc>
    <lastmod>${new Date(v.updatedAt).toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`,
      ),
      ...sellModels.map(
        (m) => `  <url>
    <loc>${escapeXml(`${baseUrl}${m.path}`)}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`,
      ),
    ];

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
  }

  getLlmsTxt() {
    const base = String(env.frontendUrl).replace(/\/$/, '');
    return `# Zephyr Technology
> UK shop to buy new and used phones and to sell your old phone. Genuine, checked devices, fast UK delivery and secure checkout.

## Main pages
- [Buy phones](${base}/): all phones for sale, with live price and stock
- [New phones](${base}/phones/new): new iPhones and phones
- [Used phones](${base}/phones/used): professionally checked used phones
- [Sell your phone](${base}/sell-your-phone): choose your model and get a quote
`;
  }

  getRobotsTxt() {
    const base = String(env.frontendUrl).replace(/\/$/, '');
    return `User-agent: *
Allow: /

Disallow: /dashboard/
Disallow: /cart
Disallow: /checkout
Disallow: /account
Disallow: /login
Disallow: /register
Disallow: /forget-password
Disallow: /reset-password
Disallow: /otp-verification
Disallow: /verify-code
Disallow: /confirm-sale
Disallow: /finalize-sale

Sitemap: ${base}/sitemap.xml
`;
  }
}

const seoService = new SeoService();
export default seoService;
