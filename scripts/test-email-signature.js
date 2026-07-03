/**
 * Test script — sends ONLY the Zephyr Technology email signature.
 *
 * Usage:
 *   node scripts/test-email-signature.js
 *
 * Optional env:
 *   TEST_SIGNATURE_EMAIL=someone@example.com   (default: shanjid.maktech@gmail.com)
 *
 * Requires MAIL_HOST, MAIL_USER, MAIL_PASS (and optionally MAIL_FROM) in .env
 *
 * Icons load from client ibb.co URLs. Set SIGNATURE_USE_CID=true for CID attachments.
 */

import 'dotenv/config';
import nodemailer from 'nodemailer';
import { buildEmailSignature, getSignatureIconAttachments } from '../src/utils/email-signature.js';

const TO_EMAIL = 'shanjid.maktech@gmail.com';
const PROBE_ICON = 'https://i.ibb.co.com/KzfgtnGx/rightsite-mobile.png';

const REQUIRED = ['MAIL_HOST', 'MAIL_USER', 'MAIL_PASS'];
for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`[test-email-signature] Missing ${key} in .env`);
    process.exit(1);
  }
}

function buildSignatureOnlyHtml() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Signature Preview</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr>
      <td align="left" style="padding:24px 16px;">
        ${buildEmailSignature()}
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

async function main() {
  const from = process.env.MAIL_FROM || process.env.MAIL_USER;
  const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT || 587),
    secure: String(process.env.MAIL_SECURE).toLowerCase() === 'true',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });

  console.log(`[test-email-signature] Sending signature preview to: ${TO_EMAIL}`);

  const attachments = getSignatureIconAttachments();
  const useCid = process.env.SIGNATURE_USE_CID === 'true';
  const mode = useCid
    ? `CID attachments (${attachments.length})`
    : 'client ibb.co URLs (0 attachments)';
  console.log(`[test-email-signature] Icon mode: ${mode}`);

  if (!useCid) {
    try {
      const res = await fetch(PROBE_ICON, {
        method: 'HEAD',
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        console.warn(`[test-email-signature] Icon probe warning: ${PROBE_ICON} → HTTP ${res.status}`);
      } else {
        console.log(`[test-email-signature] Icons OK: ${PROBE_ICON}`);
      }
    } catch (err) {
      console.warn(`[test-email-signature] Icon probe skipped (network): ${err.message}`);
      console.warn('  Email will still send — icons load in the recipient mail client.');
    }
  }

  const info = await transporter.sendMail({
    from,
    to: TO_EMAIL,
    subject: 'Zephyr Technology — Email Signature Preview',
    html: buildSignatureOnlyHtml(),
    attachments,
  });

  console.log('[test-email-signature] Sent successfully.');
  console.log(`  Message ID: ${info.messageId}`);
}

main().catch((err) => {
  console.error('[test-email-signature] Failed:', err.message);
  if (err.cause?.message) {
    console.error(`  Cause: ${err.cause.message}`);
  }
  process.exit(1);
});
