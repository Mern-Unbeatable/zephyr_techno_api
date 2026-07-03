/**
 * Standalone email signature HTML (no project dependency).
 *
 * Usage:
 * - Import EMAIL_SIGNATURE_HTML and use it directly in your mail platform, or
 * - Run this file and send a test email:
 *     node scripts/your-email-signature.js
 */

import "dotenv/config";
import nodemailer from "nodemailer";

// Change this to your test recipient, or set TEST_SIGNATURE_EMAIL in .env
const TO_EMAIL = process.env.TEST_SIGNATURE_EMAIL || "sahin.maktech@gmail.com";

export const EMAIL_SIGNATURE_HTML = `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:620px;margin-top:32px;border-top:1px solid #E5E7EB;padding-top:24px;font-family:Arial,Helvetica,sans-serif;">
  <tr>
    <td width="42%" valign="middle" align="center" style="padding:12px 16px 12px 0;vertical-align:middle;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
        <tr>
          <td valign="bottom" style="font-family:Arial,Helvetica,sans-serif;font-size:42px;font-weight:700;line-height:0.9;color:#1FA3C2;padding-right:3px;">Z</td>
          <td valign="bottom" style="font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:700;line-height:1;color:#052041;letter-spacing:0.5px;padding-bottom:3px;">EPHYR</td>
        </tr>
        <tr>
          <td colspan="2" align="center" style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:600;letter-spacing:5px;color:#1FA3C2;padding-top:6px;padding-bottom:10px;">TECHNOLOGY</td>
        </tr>
        <tr>
          <td colspan="2" align="center" style="padding-top:8px;line-height:0;font-size:0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
              <tr>
                <td style="line-height:0;vertical-align:middle;padding-right:5px;"><img src="https://i.ibb.co.com/0RtpqYTd/left-side-first-image.png" width="32" alt="" style="display:block;border:0;outline:none;background:transparent;height:auto;" /></td>
                <td style="line-height:0;vertical-align:middle;padding-right:5px;"><img src="https://i.ibb.co.com/vvcHb2kz/left-side-second-image.png" width="32" alt="" style="display:block;border:0;outline:none;background:transparent;height:auto;" /></td>
                <td style="line-height:0;vertical-align:middle;padding-right:5px;"><img src="https://i.ibb.co.com/xSrvzTwP/left-side-fifth-image.png" width="32" alt="" style="display:block;border:0;outline:none;background:transparent;height:auto;" /></td>
                <td style="line-height:0;vertical-align:middle;padding-right:5px;"><img src="https://i.ibb.co.com/rKk2drBk/left-side-fourth-image.png" width="32" alt="" style="display:block;border:0;outline:none;background:transparent;height:auto;" /></td>
                <td style="line-height:0;vertical-align:middle;padding-right:5px;"><img src="https://i.ibb.co.com/xSrvzTwP/left-side-fifth-image.png" width="32" alt="" style="display:block;border:0;outline:none;background:transparent;height:auto;" /></td>
                <td style="line-height:0;vertical-align:middle;padding-right:5px;"><img src="https://i.ibb.co.com/bMb9HPFv/left-side-sixth-image.png" width="32" alt="" style="display:block;border:0;outline:none;background:transparent;height:auto;" /></td>
                <td style="line-height:0;vertical-align:middle;"><img src="https://i.ibb.co.com/chSv33mh/left-side-seventh-image.png" width="32" alt="" style="display:block;border:0;outline:none;background:transparent;height:auto;" /></td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>

    <td width="2" style="width:2px;background-color:#1FA3C2;font-size:0;line-height:0;">&nbsp;</td>

    <td width="56%" valign="top" style="padding:8px 0 8px 20px;vertical-align:top;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;line-height:1.2;color:#052041;padding-bottom:2px;">Ali Shah</td>
        </tr>
        <tr>
          <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.3;color:#6B7280;padding-bottom:8px;">Managing Director</td>
        </tr>
        <tr>
          <td style="padding-bottom:10px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr><td height="2" style="height:2px;background-color:#1FA3C2;font-size:0;line-height:0;">&nbsp;</td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="padding:4px 0;vertical-align:middle;width:24px;"><img src="https://i.ibb.co.com/KzfgtnGx/rightsite-mobile.png" width="20" height="20" alt="" style="display:block;border:0;outline:none;background:transparent;" /></td>
                <td style="padding:4px 6px 4px 4px;vertical-align:middle;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;color:#6B7280;white-space:nowrap;">Mobile&nbsp;:</td>
                <td style="padding:4px 0;vertical-align:middle;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;"><a href="tel:+447500990009" style="color:#052041;text-decoration:none;">+44 7500 990009</a></td>
              </tr>
              <tr>
                <td style="padding:4px 0;vertical-align:middle;width:24px;"><img src="https://i.ibb.co.com/n8LLN8TT/rightside-call.png" width="20" height="20" alt="" style="display:block;border:0;outline:none;background:transparent;" /></td>
                <td style="padding:4px 6px 4px 4px;vertical-align:middle;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;color:#6B7280;white-space:nowrap;">Phone&nbsp;:</td>
                <td style="padding:4px 0;vertical-align:middle;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;"><a href="tel:+441753316031" style="color:#052041;text-decoration:none;">+44 1753 316031</a></td>
              </tr>
              <tr>
                <td style="padding:4px 0;vertical-align:middle;width:24px;"><img src="https://i.ibb.co.com/zTr0zRQk/rightside-email.png" width="20" height="20" alt="" style="display:block;border:0;outline:none;background:transparent;" /></td>
                <td style="padding:4px 6px 4px 4px;vertical-align:middle;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;color:#6B7280;white-space:nowrap;">Email&nbsp;:</td>
                <td style="padding:4px 0;vertical-align:middle;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;"><a href="mailto:ali@zephyrtechnology.co.uk" style="color:#052041;text-decoration:none;">ali@zephyrtechnology.co.uk</a></td>
              </tr>
              <tr>
                <td style="padding:4px 0;vertical-align:middle;width:24px;"><img src="https://i.ibb.co.com/gM1bYhsK/rightside-address.png" width="20" height="20" alt="" style="display:block;border:0;outline:none;background:transparent;" /></td>
                <td style="padding:4px 6px 4px 4px;vertical-align:middle;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;color:#6B7280;white-space:nowrap;">Address&nbsp;:</td>
                <td style="padding:4px 0;vertical-align:middle;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;color:#052041;">The Porter Building, Brunel Way,<br>Slough, England, SL1 1FQ</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding-top:8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:middle;padding-right:6px;"><img src="https://i.ibb.co.com/VYSjcMYV/website.png" width="20" height="20" alt="website" style="display:block;border:0;outline:none;background:transparent;" /></td>
                <td style="vertical-align:middle;">
                  <a href="https://www.zephyrtechnology.co.uk" style="color:#1FA3C2;text-decoration:none;font-weight:600;">www.zephyrtechnology.co.uk</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding-top:10px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-right:8px;">
                  <a href="https://www.instagram.com/zephyrtechnology" style="text-decoration:none;display:inline-block;line-height:0;">
                    <img src="https://i.ibb.co.com/dJxRmmRd/insta.png" width="54" height="54" alt="Instagram" style="display:block;border:0;outline:none;background:transparent;" />
                  </a>
                </td>
                <td>
                  <a href="https://wa.me/447500990009" style="text-decoration:none;display:inline-block;line-height:0;">
                    <img src="https://i.ibb.co.com/N6LF6nFZ/png-7.png" width="24" height="24" alt="WhatsApp" style="display:block;border:0;outline:none;background:transparent;" />
                  </a>
                </td>
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
              <tr><td height="2" style="height:2px;background-color:#1FA3C2;font-size:0;">&nbsp;</td></tr>
            </table>
          </td>
          <td align="center" style="padding:0 12px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:600;color:#052041;white-space:nowrap;letter-spacing:0.2px;">
            Your Trusted Mobile And Electronics Retailer
          </td>
          <td width="8%" style="vertical-align:middle;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr><td height="2" style="height:2px;background-color:#1FA3C2;font-size:0;">&nbsp;</td></tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`.trim();

export default EMAIL_SIGNATURE_HTML;

async function sendSignaturePreview() {
  const required = ["MAIL_HOST", "MAIL_USER", "MAIL_PASS"];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`[your-email-signature] Missing ${key} in .env`);
    }
  }

  const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT || 587),
    secure: String(process.env.MAIL_SECURE).toLowerCase() === "true",
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });

  const from = process.env.MAIL_FROM || process.env.MAIL_USER;
  console.log(`[your-email-signature] Sending to: ${TO_EMAIL}`);

  const info = await transporter.sendMail({
    from,
    to: TO_EMAIL,
    subject: "Zephyr Technology — Standalone Signature Preview",
    html: EMAIL_SIGNATURE_HTML,
  });

  console.log("[your-email-signature] Sent successfully.");
  console.log(`  Message ID: ${info.messageId}`);
}

if (process.argv[1]?.includes("your-email-signature.js")) {
  sendSignaturePreview().catch((err) => {
    console.error("[your-email-signature] Failed:", err.message);
    if (err.cause?.message) {
      console.error(`  Cause: ${err.cause.message}`);
    }
    process.exit(1);
  });
}
