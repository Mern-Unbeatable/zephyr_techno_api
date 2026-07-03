import Mailer from '../utils/mailer.js';
import AppError from '../utils/app-error.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class NewsletterService {
  constructor(mailer = new Mailer()) {
    this.mailer = mailer;
  }

  #normalizeEmail(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) {
      throw new AppError('Email is required.', 400);
    }
    if (!EMAIL_REGEX.test(normalized)) {
      throw new AppError('Please provide a valid email address.', 400);
    }
    return normalized;
  }

  async subscribe(payload) {
    const email = this.#normalizeEmail(payload.email);

    await this.mailer.sendNewsletterSubscriptionNotification({ subscriberEmail: email });

    return { email };
  }
}

export default new NewsletterService();
