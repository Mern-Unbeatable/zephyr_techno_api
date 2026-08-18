import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const AVATAR_SIZE = 400;

/**
 * Crop/resize profile photo to a square JPEG for consistent avatars.
 */
export async function normalizeAvatarFile(file) {
  if (!file?.path) return file;

  const dir = path.dirname(file.path);
  const base = path.basename(file.path, path.extname(file.path));
  const outPath = path.join(dir, `${base}-avatar.jpg`);

  try {
    await sharp(file.path)
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, {
        fit: 'cover',
        position: 'centre',
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
