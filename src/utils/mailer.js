import nodemailer from 'nodemailer';
import AppError from './app-error.js';
import env from '../config/env.js';

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
