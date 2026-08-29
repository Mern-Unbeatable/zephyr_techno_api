import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

/** Product gallery canvas — square so portrait phone photos fit without cropping. */
export const PRODUCT_IMAGE_SIZE = 1080;

/** White pad so gallery padding matches photo white backgrounds. */
const PAD_BACKGROUND = { r: 255, g: 255, b: 255, alpha: 1 };

/**
 * Fit image into a square canvas with contain + padding (no crop).
 * Replaces the multer file on disk and updates the multer file descriptor.
 */
export async function normalizeProductImageFile(file) {
  if (!file?.path) return file;

  const dir = path.dirname(file.path);
  const base = path.basename(file.path, path.extname(file.path));
  const outPath = path.join(dir, `${base}-sq.jpg`);

  try {
    await sharp(file.path)
      .rotate()
      .resize(PRODUCT_IMAGE_SIZE, PRODUCT_IMAGE_SIZE, {
        fit: 'contain',
        background: PAD_BACKGROUND,
        withoutEnlargement: false,
      })
      .jpeg({ quality: 85, mozjpeg: true })
      .toFile(outPath);

    await fs.unlink(file.path).catch(() => {});

    file.path = outPath;
    file.filename = path.basename(outPath);
    file.mimetype = 'image/jpeg';
    try {
      const stat = await fs.stat(outPath);
      file.size = stat.size;
    } catch {
      // size is informational only
    }
  } catch (err) {
    await fs.unlink(outPath).catch(() => {});
    throw err;
  }

  return file;
}

export async function normalizeProductImageFiles(files = []) {
  if (!files?.length) return files;
  await Promise.all(files.map((file) => normalizeProductImageFile(file)));
  return files;
}
