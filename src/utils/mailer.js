import nodemailer from 'nodemailer';
import AppError from './app-error.js';
import env from '../config/env.js';
import { buildEmailSignature, getSignatureIconAttachments } from './email-signature.js';
import { formatStorageLabel } from './stock.js';

class Mailer {
  constructor() {
    this.from = env.mailFrom;
    this.transporter = nodemailer.createTransport({
      host: env.mailHost,
      port: env.mailPort,
      secure: env.mailSecure,
      auth: env.mailUser && env.mailPass
        ? { user: env.mailUser, pass: env.mailPass }
        : undefined,
    });
  }

  #assertConfigured() {
    if (!env.mailHost || !this.from) {
      throw new AppError('Mail service is not configured.', 500);
    }
  }

  #wrapPlainHtml(body) {
    return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:24px 16px;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
  ${body}
</body>
</html>
    `.trim();
  }

  #buildOtpMessage(title, otp, purpose, recipientName) {
    const greeting = recipientName ? `Hello ${recipientName},` : 'Hello,';
    const text = `${greeting}\n\nYour ${purpose} OTP is: ${otp}\n\nThis OTP expires shortly.\n\n— Zephyr Technology`;

    const body = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#374151;">
        <h2 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#052041;">${title}</h2>
        <p style="margin:0 0 12px;">Hello${recipientName ? ` ${recipientName}` : ''},</p>
        <p style="margin:0 0 12px;">Your ${purpose} OTP is:</p>
        <div style="font-size:28px;font-weight:700;letter-spacing:6px;margin:20px 0;padding:16px 20px;background:#f3f4f6;display:inline-block;border-radius:8px;color:#052041;border-left:4px solid #1FA3C2;">${otp}</div>
        <p style="margin:0;color:#6B7280;font-size:14px;">This OTP expires shortly. If you did not request this, you can ignore this email.</p>
      </div>
    `;

    return { html: this.#wrapPlainHtml(body), text };
  }

  async #sendMail({ to, subject, html, text, replyTo, attachments = [] }) {
    this.#assertConfigured();
    return this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      html,
      ...(text && { text }),
      attachments,
      ...(replyTo && { replyTo }),
    });
  }

  async sendEmailVerificationOtp({ to, otp, recipientName }) {
    const { html, text } = this.#buildOtpMessage('Email Verification', otp, 'email verification', recipientName);
    return this.#sendMail({
      to,
      subject: 'Verify your email address',
      html,
      text,
    });
  }

  async sendPasswordResetOtp({ to, otp, recipientName }) {
    const { html, text } = this.#buildOtpMessage('Password Reset', otp, 'password reset', recipientName);
    return this.#sendMail({
      to,
      subject: 'Password reset OTP',
      html,
      text,
    });
  }

  #escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  #formatGbp(amount) {
    return `£${Number(amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  #formatAddress(address) {
    if (!address) return '';
    const parts = [
      address.fullName,
      address.phone,
      address.street,
      [address.city, address.state].filter(Boolean).join(', '),
      address.zipCode,
      address.country,
    ].filter(Boolean);
    return parts.join(', ');
  }

  #buildOrderItemsHtml(orderItems = []) {
    const rows = orderItems.map((item) => {
      const title = this.#escapeHtml(item.product?.title || 'Product');
      const color = this.#escapeHtml(item.color?.name || '');
      const storage = this.#escapeHtml(formatStorageLabel(item.storageOption?.name || ''));
      const options = [color, storage].filter(Boolean).join(' · ');
      const lineTotal = Number(item.priceAtPurchase) * Number(item.quantity);

      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #E5E7EB;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#374151;">
            <strong style="color:#052041;">${title}</strong>
            ${options ? `<br><span style="font-size:12px;color:#6B7280;">${options}</span>` : ''}
            <br><span style="font-size:12px;color:#6B7280;">Qty: ${item.quantity}</span>
          </td>
          <td align="right" style="padding:12px 0;border-bottom:1px solid #E5E7EB;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#052041;white-space:nowrap;">
            ${this.#formatGbp(lineTotal)}
          </td>
        </tr>
      `;
    }).join('');

    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
        <tr>
          <th align="left" style="padding:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6B7280;text-transform:uppercase;letter-spacing:0.04em;">Item</th>
          <th align="right" style="padding:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6B7280;text-transform:uppercase;letter-spacing:0.04em;">Total</th>
        </tr>
        ${rows}
      </table>
    `;
  }

  #buildOrderSummaryHtml(order) {
    const orderId = this.#escapeHtml(order.stringId);
    const shippingMethod = this.#escapeHtml(order.shippingMethod || 'Standard Delivery');
    const paymentMethod = this.#escapeHtml(order.paymentMethod || 'STRIPE');
    const shippingAddress = this.#escapeHtml(this.#formatAddress(order.address));
    const subtotal = Number(order.totalPrice) - Number(order.shippingCost || 0) + Number(order.discountTotal || 0);
    const discount = Number(order.discountTotal || 0);
    const shippingCost = Number(order.shippingCost || 0);
    const total = Number(order.totalPrice || 0);
    const promoCode = order.promoCodeUsed ? this.#escapeHtml(order.promoCodeUsed) : null;

    return `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#374151;">
        <p style="margin:0 0 8px;"><strong style="color:#052041;">Order number:</strong> ${orderId}</p>
        <p style="margin:0 0 16px;color:#6B7280;font-size:14px;">Placed on ${new Date(order.createdAt || Date.now()).toUTCString()}</p>
        ${this.#buildOrderItemsHtml(order.orderItems)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">
          <tr>
            <td style="padding:4px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#6B7280;">Subtotal</td>
            <td align="right" style="padding:4px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#374151;">${this.#formatGbp(subtotal)}</td>
          </tr>
          ${discount > 0 ? `
          <tr>
            <td style="padding:4px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#6B7280;">Discount${promoCode ? ` (${promoCode})` : ''}</td>
            <td align="right" style="padding:4px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#16A34A;">-${this.#formatGbp(discount)}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:4px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#6B7280;">Shipping (${shippingMethod})</td>
            <td align="right" style="padding:4px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#374151;">${this.#formatGbp(shippingCost)}</td>
          </tr>
          <tr>
            <td style="padding:12px 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:#052041;">Total paid</td>
            <td align="right" style="padding:12px 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:#052041;">${this.#formatGbp(total)}</td>
          </tr>
        </table>
        <div style="margin-top:20px;padding:16px;background:#f3f4f6;border-radius:8px;border-left:4px solid #1FA3C2;">
          <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#052041;">Shipping address</p>
          <p style="margin:0;font-size:14px;color:#374151;">${shippingAddress}</p>
        </div>
        <p style="margin:16px 0 0;font-size:13px;color:#6B7280;">Payment method: ${paymentMethod}</p>
      </div>
    `;
  }

  #buildOrderPlainText(order, { title, intro }) {
    const lines = [
      title,
      '',
      intro,
      '',
      `Order number: ${order.stringId}`,
      `Placed on: ${new Date(order.createdAt || Date.now()).toUTCString()}`,
      '',
      'Items:',
    ];

    for (const item of order.orderItems || []) {
      const options = [item.color?.name, formatStorageLabel(item.storageOption?.name || '')]
        .filter(Boolean)
        .join(' · ');
      const lineTotal = Number(item.priceAtPurchase) * Number(item.quantity);
      lines.push(`- ${item.product?.title || 'Product'}${options ? ` (${options})` : ''} x${item.quantity}: ${this.#formatGbp(lineTotal)}`);
    }

    lines.push(
      '',
      `Shipping (${order.shippingMethod || 'Standard Delivery'}): ${this.#formatGbp(order.shippingCost)}`,
      `Total paid: ${this.#formatGbp(order.totalPrice)}`,
      '',
      'Shipping address:',
      this.#formatAddress(order.address),
      '',
      '— Zephyr Technology',
    );

    return lines.join('\n');
  }

  async sendOrderConfirmation({ to, recipientName, order }) {
    const greeting = recipientName ? `Hello ${recipientName},` : 'Hello,';
    const body = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#374151;">
        <h2 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#052041;">Order Confirmed</h2>
        <p style="margin:0 0 12px;">${this.#escapeHtml(greeting)}</p>
        <p style="margin:0 0 16px;">Thank you for your purchase. We have received your payment and your order is now being processed.</p>
      </div>
      ${this.#buildOrderSummaryHtml(order)}
      <div style="margin-top:28px;padding-top:20px;border-top:1px solid #E5E7EB;">
        ${buildEmailSignature()}
      </div>
    `;

    return this.#sendMail({
      to,
      subject: `Order confirmed — ${order.stringId}`,
      html: this.#wrapPlainHtml(body),
      text: this.#buildOrderPlainText(order, {
        title: 'Order Confirmed',
        intro: 'Thank you for your purchase. We have received your payment and your order is now being processed.',
      }),
      attachments: getSignatureIconAttachments(),
    });
  }

  async sendNewOrderNotification({ order, customerEmail }) {
    const safeCustomerEmail = customerEmail ? this.#escapeHtml(customerEmail) : 'Not provided';
    const customerName = this.#escapeHtml(order.address?.fullName || 'Customer');
    const customerPhone = order.address?.phone
      ? this.#escapeHtml(order.address.phone)
      : 'Not provided';
    const body = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#374151;">
        <h2 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#052041;">New Order Received</h2>
        <p style="margin:0 0 12px;">A new paid order has been placed on Zephyr Technology.</p>
        <p style="margin:0 0 8px;"><strong style="color:#052041;">Customer:</strong> ${customerName}</p>
        <p style="margin:0 0 8px;"><strong style="color:#052041;">Email:</strong> ${safeCustomerEmail}</p>
        <p style="margin:0 0 16px;"><strong style="color:#052041;">Phone:</strong> ${customerPhone}</p>
      </div>
      ${this.#buildOrderSummaryHtml(order)}
    `;

    return this.#sendMail({
      to: env.orderNotifyEmail,
      ...(customerEmail && { replyTo: customerEmail }),
      subject: `New order — ${order.stringId}`,
      html: this.#wrapPlainHtml(body),
      text: this.#buildOrderPlainText(order, {
        title: 'New Order Received',
        intro: `Customer: ${order.address?.fullName || 'Customer'}\nEmail: ${customerEmail || 'Not provided'}\nPhone: ${order.address?.phone || 'Not provided'}`,
      }),
    });
  }

  async sendBackInStockNotification({ notification }) {
    const productTitle = this.#escapeHtml(notification.product?.title || 'Product');
    const colorName = this.#escapeHtml(notification.color?.name || '');
    const storageName = this.#escapeHtml(formatStorageLabel(notification.storageOption?.name || ''));
    const variantLabel = [colorName, storageName].filter(Boolean).join(' · ');
    const productUrl = `${env.frontendUrl}/product-details/${notification.productId}`;

    const body = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#374151;">
        <h2 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#052041;">Back in Stock</h2>
        <p style="margin:0 0 12px;">Good news — the item you asked about is available again.</p>
        <p style="margin:0 0 8px;"><strong style="color:#052041;">Product:</strong> ${productTitle}</p>
        ${variantLabel ? `<p style="margin:0 0 16px;"><strong style="color:#052041;">Variant:</strong> ${variantLabel}</p>` : ''}
        <p style="margin:0 0 20px;">
          <a href="${productUrl}" style="display:inline-block;padding:12px 20px;background:#1FA3C2;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">
            View Product
          </a>
        </p>
      </div>
      <div style="margin-top:28px;padding-top:20px;border-top:1px solid #E5E7EB;">
        ${buildEmailSignature()}
      </div>
    `;

    const text = [
      'Back in Stock',
      '',
      'Good news — the item you asked about is available again.',
      '',
      `Product: ${notification.product?.title || 'Product'}`,
      variantLabel ? `Variant: ${variantLabel}` : null,
      `View product: ${productUrl}`,
      '',
      '— Zephyr Technology',
    ].filter(Boolean).join('\n');

    return this.#sendMail({
      to: notification.email,
      subject: `${notification.product?.title || 'Product'} is back in stock`,
      html: this.#wrapPlainHtml(body),
      text,
      attachments: getSignatureIconAttachments(),
    });
  }

  async sendNewsletterSubscriptionNotification({ subscriberEmail }) {
    const safeEmail = String(subscriberEmail)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    const body = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#374151;">
        <h2 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#052041;">New Newsletter Subscription</h2>
        <p style="margin:0 0 12px;">Someone subscribed to the Zephyr Technology newsletter.</p>
        <p style="margin:0 0 8px;"><strong style="color:#052041;">Email address:</strong></p>
        <p style="margin:0 0 16px;padding:12px 16px;background:#f3f4f6;border-radius:8px;border-left:4px solid #1FA3C2;color:#052041;font-size:16px;">${safeEmail}</p>
        <p style="margin:0;color:#6B7280;font-size:14px;">Submitted on ${new Date().toUTCString()}</p>
      </div>
    `;

    return this.#sendMail({
      to: env.newsletterNotifyEmail,
      replyTo: subscriberEmail,
      subject: 'New newsletter subscription',
      html: this.#wrapPlainHtml(body),
    });
  }
}

export default Mailer;
