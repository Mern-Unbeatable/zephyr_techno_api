import asyncHandler from '../utils/async-handler.js';
import AppError from '../utils/app-error.js';
import { normalizeProductImageFiles } from '../utils/normalize-product-image.js';

/**
 * After multer: normalize product gallery uploads to square 1080×1080 (contain + pad).
 */
const normalizeProductImages = asyncHandler(async (req, _res, next) => {
  if (!req.files?.length) return next();

  try {
    await normalizeProductImageFiles(req.files);
    next();
  } catch (err) {
    throw new AppError(
      err?.message || 'Failed to process product image. Please try another file.',
      400,
    );
  }
});

export default normalizeProductImages;
