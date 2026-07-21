import env from '../config/env.js';

/**
 * Builds a full URL for an uploaded file based on the environment.
 * @param {string} filePath - The relative file path (e.g., 'uploads/image.jpg').
 * @returns {string} The complete URL.
 */
export const buildImageUrl = (filePath) => {
  if (!filePath) return null;

  if (/^https?:\/\//i.test(filePath)) {
    return filePath;
  }

  // Normalize path to use forward slashes
  const normalizedPath = filePath.replace(/\\/g, '/').replace(/^\/+/, '');

  const baseUrl =
    process.env.LIVE_URL ||
    (env.nodeEnv === 'production'
      ? 'https://api.zephyrtechnology.co.uk'
      : `http://localhost:${env.port}`);

  return `${String(baseUrl).replace(/\/$/, '')}/${normalizedPath}`;
};

export function resolveProductThumbnail(product, colorId) {
  const galleries = product?.productGalleries || [];
  if (!galleries.length) return null;

  const colorImage =
    colorId != null
      ? galleries.find((gallery) => gallery.colorId === colorId)
      : null;
  const sharedImage = galleries.find((gallery) => !gallery.colorId);
  const image = colorImage || sharedImage || galleries[0];

  return image?.imageUrl ? buildImageUrl(image.imageUrl) : null;
};
