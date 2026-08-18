import asyncHandler from '../utils/async-handler.js';
import AppError from '../utils/app-error.js';
import { normalizeAvatarFile } from '../utils/normalize-avatar-image.js';

const normalizeAvatar = asyncHandler(async (req, _res, next) => {
  if (!req.file) return next();

  try {
    await normalizeAvatarFile(req.file);
    next();
  } catch (err) {
    throw new AppError(
      err?.message || 'Failed to process profile image. Please try another file.',
      400,
    );
  }
});

export default normalizeAvatar;
