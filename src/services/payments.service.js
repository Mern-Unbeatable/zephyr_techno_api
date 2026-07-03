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

    // Create order first (PENDING)
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
        currency: 'usd',
        product_data: { name: it.title },
        unit_amount: Math.round(it.priceAtPurchase * 100),
      },
      quantity: it.quantity,
    }));

    const successUrl = process.env.STRIPE_SUCCESS_URL || `${env.nodeEnv === 'development' ? 'http://localhost:3000' : ''}/checkout/success?orderId=${order.id}`;
    const cancelUrl = process.env.STRIPE_CANCEL_URL || `${env.nodeEnv === 'development' ? 'http://localhost:3000' : ''}/checkout/cancel`;

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: userEmail || undefined,
      line_items,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { orderId: order.id },
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

    // Payment status is in session.payment_status (e.g., 'paid')
    if (session.payment_status !== 'paid') {
      throw new Error('Payment not completed');
    }

    const orderId = session.metadata?.orderId;
    if (!orderId) throw new Error('Order id missing from session metadata');

    // Update order status to PROCESSING and payment status to PAID
    const updatedOrder = await orderService.confirmPayment(orderId, 'PROCESSING', 'PAID');

    return updatedOrder;
  }
}

export default new PaymentsService();
