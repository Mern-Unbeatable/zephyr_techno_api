/**
 * Zephyr Technology — HTML email signature.
 *
 * Icons load from client-hosted ibb.co URLs (no LIVE_URL required).
 * Fallback: SIGNATURE_USE_CID=true embeds local PNGs via CID attachments.
 *
 * Colors: #052041 (navy), #1FA3C2 (teal)
 */

import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, '..', '..', 'static', 'email-icons');
const DEVICE_ROW_FILE = 'device-row.png';
const CID_DOMAIN = 'zephyrtechnology.co.uk';

const USE_CID = process.env.SIGNATURE_USE_CID === 'true';

const ICON_SIZES = {
  contact: 20,
  website: 20,
  instagram: 54,
  whatsapp: 24,
  device: 18,
};

/** Client-provided signature icons (ibb.co). */
const ICON_URLS = {
  mobile: 'https://i.ibb.co.com/KzfgtnGx/rightsite-mobile.png',
  phone: 'https://i.ibb.co.com/n8LLN8TT/rightside-call.png',
  email: 'https://i.ibb.co.com/zTr0zRQk/rightside-email.png',
  address: 'https://i.ibb.co.com/gM1bYhsK/rightside-address.png',
  website: 'https://i.ibb.co.com/VYSjcMYV/website.png',
  instagram: 'https://i.ibb.co.com/dJxRmmRd/insta.png',
  whatsapp: 'https://i.ibb.co.com/N6LF6nFZ/png-7.png',
  // whatsapp: 'https://i.ibb.co.com/YT8pWHmJ/whatsapp-1384095.png',
};

const DEVICE_ROW_URLS = [
  'https://i.ibb.co.com/0RtpqYTd/left-side-first-image.png',
  'https://i.ibb.co.com/vvcHb2kz/left-side-second-image.png',
  'https://i.ibb.co.com/xSrvzTwP/left-side-fifth-image.png',
  'https://i.ibb.co.com/rKk2drBk/left-side-fourth-image.png',
  'https://i.ibb.co.com/xSrvzTwP/left-side-fifth-image.png',
  'https://i.ibb.co.com/bMb9HPFv/left-side-sixth-image.png',
  'https://i.ibb.co.com/chSv33mh/left-side-seventh-image.png',
];

const COLORS = {
  navy: '#052041',
  teal: '#1FA3C2',
  text: '#374151',
  muted: '#6B7280',
  border: '#E5E7EB',
};

const SIGNATURE = {
  name: 'Ali Shah',
  title: 'Managing Director',
  mobile: '+44 7500 990009',
  phone: '+44 1753 316031',
  email: 'ali@zephyrtechnology.co.uk',
  addressLine1: 'The Porter Building, Brunel Way,',
  addressLine2: 'Slough, England, SL1 1FQ',
  website: 'www.zephyrtechnology.co.uk',
  websiteUrl: 'https://www.zephyrtechnology.co.uk',
  tagline: 'Your Trusted Mobile And Electronics Retailer',
  whatsappUrl: 'https://wa.me/447500990009',
  instagramUrl: 'https://www.instagram.com/zephyrtechnology',
};

const ICON_MAP = {
  mobile: 'mobile.png',
  phone: 'phone.png',
  email: 'email.png',
  address: 'address.png',
  website: 'website.png',
  instagram: 'instagram.png',
  whatsapp: 'whatsapp.png',
};

function cidFor(key) {
  return `${key}@${CID_DOMAIN}`;
}

function iconSrc(key) {
  if (!ICON_URLS[key]) return '';
  if (USE_CID && existsSync(join(ICONS_DIR, ICON_MAP[key]))) {
    return `cid:${cidFor(key)}`;
  }
  return ICON_URLS[key];
}

function iconImg(key, { width = 16, height = 16, alt = '' } = {}) {
  const src = iconSrc(key);
  if (!src) return '';
  return `<img src="${src}" width="${width}" height="${height}" alt="${alt}" style="display:block;border:0;outline:none;background:transparent;" />`;
}

function iconLink(key, href, { width = 18, height = 18 } = {}) {
  return `<a href="${href}" style="text-decoration:none;display:inline-block;line-height:0;">${iconImg(key, { width, height })}</a>`;
}

function deviceRowHtml() {
  const { device: size } = ICON_SIZES;
  const compositeWidth = DEVICE_ROW_URLS.length * size + (DEVICE_ROW_URLS.length - 1) * 5;

  if (USE_CID && existsSync(join(ICONS_DIR, DEVICE_ROW_FILE))) {
    return `<img src="cid:${cidFor('device-row')}" width="${compositeWidth}" height="${size}" alt="" style="display:block;border:0;outline:none;background:transparent;" />`;
  }

  const cells = DEVICE_ROW_URLS.map((url, index) => {
    const pad = index < DEVICE_ROW_URLS.length - 1 ? 'padding-right:5px;' : '';
    return `<td style="line-height:0;${pad}"><img src="${url}" width="${size}" height="${size}" alt="" style="display:block;border:0;outline:none;background:transparent;" /></td>`;
  }).join('');

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>${cells}</tr></table>`;
}

function buildBrandHtml() {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
      <tr>
        <td valign="bottom" style="font-family:Arial,Helvetica,sans-serif;font-size:42px;font-weight:700;line-height:0.9;color:${COLORS.teal};padding-right:3px;">Z</td>
        <td valign="bottom" style="font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:700;line-height:1;color:${COLORS.navy};letter-spacing:0.5px;padding-bottom:3px;">EPHYR</td>
      </tr>
      <tr>
        <td colspan="2" align="center" style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:600;letter-spacing:5px;color:${COLORS.teal};padding-top:6px;padding-bottom:10px;">TECHNOLOGY</td>
      </tr>
      <tr>
        <td colspan="2" align="center" style="padding-top:4px;line-height:0;">${deviceRowHtml()}</td>
      </tr>
    </table>
  `;
}

function contactRow(iconKey, label, value, href = null) {
  const valueHtml = href
    ? `<a href="${href}" style="color:${COLORS.navy};text-decoration:none;">${value}</a>`
    : `<span style="color:${COLORS.navy};">${value}</span>`;

  return `
    <tr>
      <td style="padding:4px 0;vertical-align:middle;width:24px;">${iconImg(iconKey, { width: ICON_SIZES.contact, height: ICON_SIZES.contact })}</td>
      <td style="padding:4px 6px 4px 4px;vertical-align:middle;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;color:${COLORS.muted};white-space:nowrap;">${label}&nbsp;:</td>
      <td style="padding:4px 0;vertical-align:middle;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;">${valueHtml}</td>
    </tr>
  `;
}

function inlineAttachment(filename, cidKey) {
  const filePath = join(ICONS_DIR, filename);
  if (!existsSync(filePath)) {
    console.warn(`[email-signature] Missing ${filePath} — run npm run generate:email-icons`);
    return null;
  }

  return {
    path: filePath,
    cid: cidFor(cidKey),
    contentType: 'image/png',
    contentDisposition: 'inline',
  };
}

/** Returns [] unless SIGNATURE_USE_CID=true (local PNG fallbacks). */
export function getSignatureIconAttachments() {
  if (!USE_CID) return [];

  const attachments = Object.entries(ICON_MAP)
    .map(([key, file]) => inlineAttachment(file, key))
    .filter(Boolean);

  const deviceRow = inlineAttachment(DEVICE_ROW_FILE, 'device-row');
  if (deviceRow) attachments.push(deviceRow);

  return attachments;
}

export function buildEmailSignature() {
  const s = SIGNATURE;
  const brandHtml = buildBrandHtml();

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:620px;margin-top:32px;border-top:1px solid ${COLORS.border};padding-top:24px;font-family:Arial,Helvetica,sans-serif;">
      <tr>
        <td width="42%" valign="middle" align="center" style="padding:12px 16px 12px 0;vertical-align:middle;">
          ${brandHtml}
        </td>

        <td width="2" style="width:2px;background-color:${COLORS.teal};font-size:0;line-height:0;">&nbsp;</td>

        <td width="56%" valign="top" style="padding:8px 0 8px 20px;vertical-align:top;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;line-height:1.2;color:${COLORS.navy};padding-bottom:2px;">${s.name}</td>
            </tr>
            <tr>
              <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.3;color:${COLORS.muted};padding-bottom:8px;">${s.title}</td>
            </tr>
            <tr>
              <td style="padding-bottom:10px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr><td height="2" style="height:2px;background-color:${COLORS.teal};font-size:0;line-height:0;">&nbsp;</td></tr>
                </table>
              </td>
            </tr>
            <tr>
              <td>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  ${contactRow('mobile', 'Mobile', s.mobile, `tel:${s.mobile.replace(/\s/g, '')}`)}
                  ${contactRow('phone', 'Phone', s.phone, `tel:${s.phone.replace(/\s/g, '')}`)}
                  ${contactRow('email', 'Email', s.email, `mailto:${s.email}`)}
                  ${contactRow('address', 'Address', `${s.addressLine1}<br>${s.addressLine2}`)}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding-top:8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align:middle;padding-right:6px;">${iconImg('website', { width: ICON_SIZES.website, height: ICON_SIZES.website, alt: 'website' })}</td>
                    <td style="vertical-align:middle;">
                      <a href="${s.websiteUrl}" style="color:${COLORS.teal};text-decoration:none;font-weight:600;">${s.website}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding-top:10px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding-right:8px;">${iconLink('instagram', s.instagramUrl, { width: ICON_SIZES.instagram, height: ICON_SIZES.instagram })}</td>
                    <td>${iconLink('whatsapp', s.whatsappUrl, { width: ICON_SIZES.whatsapp, height: ICON_SIZES.whatsapp })}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td colspan="3" style="padding-top:20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td width="8%" style="vertical-align:middle;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr><td height="2" style="height:2px;background-color:${COLORS.teal};font-size:0;">&nbsp;</td></tr>
                </table>
              </td>
              <td align="center" style="padding:0 12px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:600;color:${COLORS.navy};white-space:nowrap;letter-spacing:0.2px;">
                ${s.tagline}
              </td>
              <td width="8%" style="vertical-align:middle;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr><td height="2" style="height:2px;background-color:${COLORS.teal};font-size:0;">&nbsp;</td></tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

export function wrapEmailHtml(bodyHtml) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zephyr Technology</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;">
    <tr>
      <td align="left" style="padding:24px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:620px;">
          <tr>
            <td style="font-family:Arial,Helvetica,sans-serif;color:${COLORS.text};">
              ${bodyHtml}
              ${buildEmailSignature()}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
