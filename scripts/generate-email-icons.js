/**
 * Download client-provided signature icons from ibb.co for CID fallback.
 * Builds device-row.png composite from the 7 left-side device images.
 *
 * Usage: npm run generate:email-icons
 */

import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { Resvg } from '@resvg/resvg-js';

const OUT_DIR = join(process.cwd(), 'uploads', 'email-icons');
const STATIC_DIR = join(process.cwd(), 'static', 'email-icons');

const CLIENT_ICONS = {
  mobile: 'https://i.ibb.co.com/KzfgtnGx/rightsite-mobile.png',
  phone: 'https://i.ibb.co.com/n8LLN8TT/rightside-call.png',
  email: 'https://i.ibb.co.com/zTr0zRQk/rightside-email.png',
  address: 'https://i.ibb.co.com/gM1bYhsK/rightside-address.png',
  website: 'https://i.ibb.co.com/VYSjcMYV/website.png',
  instagram: 'https://i.ibb.co.com/dJxRmmRd/insta.png',
  whatsapp: 'https://i.ibb.co.com/YT8pWHmJ/whatsapp-1384095.png',
};

const DEVICE_ROW_SOURCES = [
  { url: 'https://i.ibb.co.com/0RtpqYTd/left-side-first-image.png', filename: 'device-1.png' },
  { url: 'https://i.ibb.co.com/vvcHb2kz/left-side-second-image.png', filename: 'device-2.png' },
  { url: 'https://i.ibb.co.com/xSrvzTwP/left-side-fifth-image.png', filename: 'device-3.png' },
  { url: 'https://i.ibb.co.com/rKk2drBk/left-side-fourth-image.png', filename: 'device-4.png' },
  { url: 'https://i.ibb.co.com/xSrvzTwP/left-side-fifth-image.png', filename: 'device-5.png' },
  { url: 'https://i.ibb.co.com/bMb9HPFv/left-side-sixth-image.png', filename: 'device-6.png' },
  { url: 'https://i.ibb.co.com/chSv33mh/left-side-seventh-image.png', filename: 'device-7.png' },
];

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(STATIC_DIR, { recursive: true });

async function downloadIcon(url, filename) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${filename} (${res.status}): ${url}`);
  }
  const png = Buffer.from(await res.arrayBuffer());
  writeFileSync(join(OUT_DIR, filename), png);
  writeFileSync(join(STATIC_DIR, filename), png);
  console.log(`  ✓ ${filename}`);
  return png;
}

function buildHorizontalComposite(filename, rowFiles, { iconSize = 18, gap = 5 } = {}) {
  let x = 0;
  const images = rowFiles
    .map((file) => {
      const b64 = readFileSync(join(OUT_DIR, file)).toString('base64');
      const tag = `<image href="data:image/png;base64,${b64}" x="${x}" y="0" width="${iconSize}" height="${iconSize}"/>`;
      x += iconSize + gap;
      return tag;
    })
    .join('');

  const totalWidth = x - gap;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${iconSize}">${images}</svg>`;
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: totalWidth } }).render().asPng();
  writeFileSync(join(OUT_DIR, filename), png);
  writeFileSync(join(STATIC_DIR, filename), png);
  console.log(`  ✓ ${filename} (composite)`);
}

console.log('[generate-email-icons] Downloading client icons…\n');

for (const [key, url] of Object.entries(CLIENT_ICONS)) {
  await downloadIcon(url, `${key}.png`);
}

console.log('');
for (const { url, filename } of DEVICE_ROW_SOURCES) {
  await downloadIcon(url, filename);
}

console.log('');
buildHorizontalComposite('device-row.png', DEVICE_ROW_SOURCES.map((d) => d.filename));

console.log('\n[generate-email-icons] Done → static/email-icons/ & uploads/email-icons/');
