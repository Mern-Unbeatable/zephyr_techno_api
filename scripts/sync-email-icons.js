/**
 * Copy committed static/email-icons → uploads/email-icons on deploy.
 * Icons are client assets from ibb.co; run generate:email-icons to refresh local copies.
 */

import { cpSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

const SRC = join(process.cwd(), 'static', 'email-icons');
const DEST = join(process.cwd(), 'uploads', 'email-icons');

if (!existsSync(SRC)) {
  console.warn('[sync-email-icons] static/email-icons/ not found — run npm run generate:email-icons');
  process.exit(0);
}

mkdirSync(DEST, { recursive: true });

for (const file of readdirSync(SRC)) {
  if (!file.endsWith('.png')) continue;
  cpSync(join(SRC, file), join(DEST, file));
}

console.log(`[sync-email-icons] Copied icons → uploads/email-icons/`);
