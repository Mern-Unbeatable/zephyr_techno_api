import { Router } from 'express';
import asyncHandler from '../utils/async-handler.js';
import seoService from '../services/seo.service.js';
import env from '../config/env.js';

const router = Router();

const escapeXml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

// Legacy product-only sitemap (kept for older robots.txt references).
router.get(
  '/sitemap-products.xml',
  asyncHandler(async (req, res) => {
    const baseUrl = String(env.frontendUrl).replace(/\/$/, '');
    const variants = await seoService.listProductVariantsForSitemap();

    const urls = variants
      .map(
        (variant) => `  <url>
    <loc>${escapeXml(`${baseUrl}${variant.path}`)}</loc>
    <lastmod>${new Date(variant.updatedAt).toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`,
      )
      .join('\n');

    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    });
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`);
  }),
);

export default router;
