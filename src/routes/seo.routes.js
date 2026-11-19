import { Router } from 'express';
import asyncHandler from '../utils/async-handler.js';
import seoService from '../services/seo.service.js';

const router = Router();

router.get(
  '/api/public/seo/meta',
  asyncHandler(async (req, res) => {
    const pathname = String(req.query.path || '/');
    const page = req.query.page;
    const meta = await seoService.getMetaForPath(pathname, { page });
    if (!meta) {
      res.status(404).json({
        success: false,
        message: 'No SEO metadata for this path',
      });
      return;
    }
    res.json({ success: true, data: meta });
  }),
);

router.get(
  '/api/public/seo/product/:slug',
  asyncHandler(async (req, res) => {
    const data = await seoService.resolveProductBySlug(req.params.slug);
    if (!data) {
      res.status(404).json({ success: false, message: 'Product variant not found' });
      return;
    }
    res.json({ success: true, data });
  }),
);

router.get(
  '/api/public/seo/product-canonical',
  asyncHandler(async (req, res) => {
    const data = await seoService.resolveProductCanonical({
      productId: req.query.productId,
      colorId: req.query.colorId || null,
      storageOptionId: req.query.storageOptionId || null,
      conditionCategoryId: req.query.conditionCategoryId || undefined,
    });
    if (!data) {
      res.status(404).json({ success: false, message: 'Product variant not found' });
      return;
    }
    res.json({ success: true, data });
  }),
);

router.get(
  '/api/public/seo/sell/:slug',
  asyncHandler(async (req, res) => {
    const data = await seoService.resolveSellModelBySlug(req.params.slug);
    if (!data) {
      res.status(404).json({ success: false, message: 'Sell model not found' });
      return;
    }
    res.json({ success: true, data });
  }),
);

router.get(
  '/sitemap.xml',
  asyncHandler(async (req, res) => {
    const xml = await seoService.buildSitemapXml();
    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    });
    res.send(xml);
  }),
);

router.get(
  '/robots.txt',
  asyncHandler(async (req, res) => {
    res.set({
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    });
    res.send(seoService.getRobotsTxt());
  }),
);

router.get(
  '/llms.txt',
  asyncHandler(async (req, res) => {
    res.set({
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    });
    res.send(seoService.getLlmsTxt());
  }),
);

export default router;
