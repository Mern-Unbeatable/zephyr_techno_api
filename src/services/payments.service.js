import Stripe from 'stripe';
import env from '../config/env.js';
import orderService from './orders.service.js';
import prisma from '../utils/prisma.js';

class PaymentsService {
  constructor() {
    this.stripeSecret = process.env.STRIPE_SECRET || null;
    if (this.stripeSecret) this.stripe = new Stripe(this.stripeSecret, { apiVersion: '2022-11-15' });
  }

  async createCheckoutSession(userId, guestSessionId, guestEmail, shippingAddress, cartItemIds = null, shippingMethod = null, shippingCost = 0, promoCode = null, directProduct = null) {
    if (!this.stripe) throw new Error('Stripe not configured. Set STRIPE_SECRET env var.');

    // Get user email for Stripe checkout - either from authenticated user or guest
    let userEmail = guestEmail;
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      userEmail = user?.email || guestEmail;
    }

    // Clear previous unpaid drafts so retries don't leave ghost orders in admin
    await orderService.abandonOpenUnpaidCheckouts({
      userId,
      guestEmail: userId ? null : guestEmail,
    });

    // Create order draft first (PENDING / unpaid) — confirmed only after Stripe payment
    const order = await orderService.createOrder(userId, guestSessionId, guestEmail, { 
      shippingAddress, 
      paymentMethod: 'STRIPE', 
      cartItemIds,
      shippingMethod,
      shippingCost: parseFloat(shippingCost) || 0,
      promoCode,
      directProduct,
    });

    // Build line items for stripe
    const line_items = order.items.map((it) => ({
      price_data: {
        currency: 'gbp',
        product_data: { name: it.title },
        unit_amount: Math.round(it.priceAtPurchase * 100),
      },
      quantity: it.quantity,
    }));

    const frontendBase =
      process.env.FRONTEND_URL ||
      (env.nodeEnv === 'development' ? 'http://localhost:5173' : 'https://zephyrtechnology.co.uk');

    const successBase =
      process.env.STRIPE_SUCCESS_URL || `${frontendBase}/checkout/success`;
    const cancelBase =
      process.env.STRIPE_CANCEL_URL || `${frontendBase}/checkout/cancel`;

    const successUrl = `${successBase}${successBase.includes('?') ? '&' : '?'}orderId=${order.id}`;
    const cancelUrl = `${cancelBase}${cancelBase.includes('?') ? '&' : '?'}orderId=${order.id}`;

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: userEmail || undefined,
      billing_address_collection: 'required',
      shipping_address_collection: { allowed_countries: ['GB'] },
      phone_number_collection: { enabled: true },
      line_items,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { orderId: order.id },
    });

    // Persist Stripe session id for cancel / reconcile
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentIntentId: session.id },
    });

    return { order, sessionUrl: session.url, sessionId: session.id };
  }

  /**
   * Confirm checkout session status by session id (no webhook flow)
   * Retrieves the Stripe session and, if paid, updates the order status.
   */
  async confirmCheckoutSession(sessionId) {
    if (!this.stripe) throw new Error('Stripe not configured. Set STRIPE_SECRET env var.');

    const session = await this.stripe.checkout.sessions.retrieve(sessionId);
    if (!session) throw new Error('Checkout session not found');

    const orderId = session.metadata?.orderId;

    // Payment status is in session.payment_status (e.g., 'paid')
    if (session.payment_status !== 'paid') {
      if (orderId) {
        await orderService.abandonUnpaidOrder(orderId, 'Payment not completed');
      }
      throw new Error('Payment not completed');
    }

    if (!orderId) throw new Error('Order id missing from session metadata');

    const shippingSource = session.shipping_details || session.customer_details || null;
    const rawAddress = shippingSource?.address || null;
    const normalizedStripeAddress = rawAddress
      ? {
          fullName: shippingSource?.name || 'Stripe Customer',
          phone: shippingSource?.phone || null,
          street: [rawAddress.line1, rawAddress.line2].filter(Boolean).join(', '),
          city: rawAddress.city || 'Unknown',
          state: rawAddress.state || null,
          zipCode: rawAddress.postal_code || 'Unknown',
          country: rawAddress.country === 'GB' ? 'United Kingdom' : (rawAddress.country || 'United Kingdom'),
        }
      : null;

    // Update order status to PROCESSING and payment status to PAID
    const updatedOrder = await orderService.confirmPayment(
      orderId,
      'PROCESSING',
      'PAID',
      normalizedStripeAddress,
    );

    return updatedOrder;
  }

  /**
   * Abandon unpaid draft when user cancels Stripe Checkout.
   */
  async cancelUnpaidCheckout(orderId) {
    return orderService.abandonUnpaidOrder(orderId, 'Customer cancelled Stripe checkout');
  }
}

export default new PaymentsService();
