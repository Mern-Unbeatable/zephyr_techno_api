import Stripe from 'stripe';
import env from '../config/env.js';
import orderService from './orders.service.js';
import prisma from '../utils/prisma.js';

const PLACEHOLDER_SHIPPING = {
  fullName: 'To be confirmed',
  phone: null,
  street: 'To be confirmed',
  city: 'To be confirmed',
  zipCode: 'TBC',
  country: 'United Kingdom',
};

function mapCountry(codeOrName) {
  if (!codeOrName) return 'United Kingdom';
  if (codeOrName === 'GB' || codeOrName === 'UK') return 'United Kingdom';
  return codeOrName;
}

function getStripePublishableKey() {
  if (process.env.STRIPE_PUBLISHABLE_KEY) return process.env.STRIPE_PUBLISHABLE_KEY;
  if (process.env.STRIPE_PUBLISHABLE) return process.env.STRIPE_PUBLISHABLE;

  const typoKey = Object.keys(process.env).find(
    (key) => key.startsWith('STRIPE_PUBLISHABLE_pk_'),
  );
  if (typoKey) {
    const value = process.env[typoKey];
    if (value && value.startsWith('pk_')) return value;
    const fromName = typoKey.replace(/^STRIPE_PUBLISHABLE_/, '');
    if (fromName.startsWith('pk_')) return fromName;
  }

  const entry = Object.entries(process.env).find(
    ([key, value]) => key.startsWith('STRIPE_PUBLISHABLE_') && value,
  );
  return entry?.[1] || null;
}

function mapPaymentIntentShipping(paymentIntent) {
  const shipping = paymentIntent.shipping || {};
  const addr = shipping.address || {};
  const billing =
    paymentIntent.latest_charge?.billing_details ||
    paymentIntent.charges?.data?.[0]?.billing_details ||
    {};

  const line1 = addr.line1;
  const line2 = addr.line2;
  const street = [line1, line2].filter(Boolean).join(', ');

  if (!shipping.name && !street && !billing.name) return null;

  return {
    email: billing.email || paymentIntent.receipt_email || null,
    fullName: shipping.name || billing.name || 'Customer',
    phone: billing.phone || null,
    street: street || PLACEHOLDER_SHIPPING.street,
    city: addr.city || PLACEHOLDER_SHIPPING.city,
    state: addr.state || null,
    zipCode: addr.postal_code || PLACEHOLDER_SHIPPING.zipCode,
    country: mapCountry(addr.country),
  };
}

function mapStripeCollectedAddress(session) {
  const shipping = session.shipping_details || session.shipping || {};
  const addr = shipping.address || session.collected_information?.shipping_details?.address || {};
  const billing = session.customer_details?.address || {};
  const use = addr.line1 ? addr : billing;
  const name =
    shipping.name ||
    session.collected_information?.shipping_details?.name ||
    session.customer_details?.name;
  const line1 = use.line1;
  const line2 = use.line2;
  const street = [line1, line2].filter(Boolean).join(', ');

  if (!name && !street) return null;

  return {
    email: session.customer_details?.email || session.customer_email || null,
    fullName: name || 'Customer',
    phone: session.customer_details?.phone || shipping.phone || null,
    street: street || PLACEHOLDER_SHIPPING.street,
    city: use.city || PLACEHOLDER_SHIPPING.city,
    state: use.state || null,
    zipCode: use.postal_code || PLACEHOLDER_SHIPPING.zipCode,
    country: mapCountry(use.country),
  };
}

class PaymentsService {
  constructor() {
    this.stripeSecret = process.env.STRIPE_SECRET || null;
    if (this.stripeSecret) this.stripe = new Stripe(this.stripeSecret, { apiVersion: '2022-11-15' });
  }

  async #draftShippingAddress(userId, shippingAddress, collectAddressOnStripe) {
    if (!collectAddressOnStripe) return shippingAddress;
    if (shippingAddress?.street && shippingAddress?.city && shippingAddress?.zipCode) {
      return shippingAddress;
    }

    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          firstName: true,
          lastName: true,
          phone: true,
          userAddresses: {
            where: { isDeleted: false },
            take: 1,
            orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
            select: {
              fullName: true,
              phone: true,
              street: true,
              city: true,
              state: true,
              zipCode: true,
              country: true,
            },
          },
        },
      });
      const addr = user?.userAddresses?.[0];
      if (addr?.street && addr?.city && addr?.zipCode) {
        return {
          fullName: addr.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
          phone: addr.phone || user.phone || null,
          street: addr.street,
          city: addr.city,
          state: addr.state || null,
          zipCode: addr.zipCode,
          country: addr.country || 'United Kingdom',
        };
      }
    }

    return PLACEHOLDER_SHIPPING;
  }

  async createCheckoutSession(
    userId,
    guestSessionId,
    guestEmail,
    shippingAddress,
    cartItemIds = null,
    shippingMethod = null,
    shippingCost = 0,
    promoCode = null,
    directProduct = null,
    collectAddressOnStripe = false,
  ) {
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

    const resolvedAddress = await this.#draftShippingAddress(
      userId,
      shippingAddress,
      collectAddressOnStripe,
    );

    // Clear previous unpaid drafts so retries don't leave ghost orders in admin
    await orderService.abandonOpenUnpaidCheckouts({
      userId,
      guestEmail: userId ? null : guestEmail,
    });

    // Create order draft first (PENDING / unpaid) — confirmed only after Stripe payment
    const order = await orderService.createOrder(userId, guestSessionId, guestEmail, { 
      shippingAddress: resolvedAddress, 
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

    const sessionConfig = {
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: userEmail || undefined,
      billing_address_collection: collectAddressOnStripe ? 'required' : 'auto',
      line_items,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        orderId: order.id,
        collectAddressOnStripe: collectAddressOnStripe ? 'true' : 'false',
      },
    };

    if (collectAddressOnStripe) {
      sessionConfig.shipping_address_collection = { allowed_countries: ['GB'] };
      sessionConfig.phone_number_collection = { enabled: true };
    }

    const session = await this.stripe.checkout.sessions.create(sessionConfig);

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

    const stripeShippingAddress = mapStripeCollectedAddress(session);
    const updatedOrder = await orderService.confirmPayment(
      orderId,
      'PROCESSING',
      'PAID',
      stripeShippingAddress,
    );

    return updatedOrder;
  }

  /**
   * Abandon unpaid draft when user cancels Stripe Checkout.
   */
  async cancelUnpaidCheckout(orderId) {
    return orderService.abandonUnpaidOrder(orderId, 'Customer cancelled Stripe checkout');
  }

  getPublishableKey() {
    return getStripePublishableKey();
  }

  #frontendHostnames() {
    const urls = [
      process.env.FRONTEND_URL,
      'https://zephyrtechnology.co.uk',
      'https://www.zephyrtechnology.co.uk',
    ].filter(Boolean);

    return [...new Set(urls.map((url) => {
      try {
        return new URL(url).hostname;
      } catch {
        return null;
      }
    }).filter(Boolean))];
  }

  /**
   * Register frontend domains so Apple Pay can open as a wallet sheet
   * on-site (Express Checkout Element), not Stripe Checkout redirect.
   */
  async registerPaymentMethodDomains() {
    if (!this.stripeSecret) return;

    const domains = this.#frontendHostnames();
    for (const domain_name of domains) {
      try {
        const res = await fetch('https://api.stripe.com/v1/payment_method_domains', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.stripeSecret}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Stripe-Version': '2024-11-20.acacia',
          },
          body: new URLSearchParams({ domain_name }),
        });
        const data = await res.json();
        if (!res.ok) {
          console.warn(`[Stripe] Domain ${domain_name}:`, data.error?.message || data);
          continue;
        }
        console.log(`[Stripe] Apple Pay domain ready: ${domain_name} (${data.apple_pay?.status || 'registered'})`);
      } catch (err) {
        console.warn(`[Stripe] Could not register domain ${domain_name}:`, err.message);
      }
    }
  }

  /**
   * Create a Payment Intent for on-page Express Checkout (Apple Pay / Google Pay).
   */
  async createExpressPaymentIntent(
    userId,
    guestSessionId,
    guestEmail,
    directProduct,
    shippingMethod = 'Standard Delivery',
    shippingCost = 0,
  ) {
    if (!this.stripe) throw new Error('Stripe not configured. Set STRIPE_SECRET env var.');

    if (!directProduct?.productId) {
      throw new Error('directProduct with productId is required');
    }

    await orderService.abandonOpenUnpaidCheckouts({
      userId,
      guestEmail: userId ? null : guestEmail,
    });

    const order = await orderService.createOrder(userId, guestSessionId, guestEmail, {
      shippingAddress: PLACEHOLDER_SHIPPING,
      paymentMethod: 'STRIPE',
      shippingMethod,
      shippingCost: parseFloat(shippingCost) || 0,
      promoCode: null,
      directProduct,
    });

    const amountPence = Math.round(order.totalPrice * 100);
    if (amountPence < 1) throw new Error('Invalid order total');

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: amountPence,
      currency: 'gbp',
      payment_method_types: ['card'],
      receipt_email: guestEmail || undefined,
      metadata: { orderId: order.id },
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { paymentIntentId: paymentIntent.id },
    });

    return {
      order,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  }

  /**
   * Confirm Express Checkout payment after client-side wallet authorization.
   */
  async confirmExpressPayment(paymentIntentId) {
    if (!this.stripe) throw new Error('Stripe not configured. Set STRIPE_SECRET env var.');

    const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge'],
    });

    if (!paymentIntent) throw new Error('Payment intent not found');

    const orderId = paymentIntent.metadata?.orderId;

    if (paymentIntent.status !== 'succeeded') {
      if (orderId) {
        await orderService.abandonUnpaidOrder(orderId, 'Express checkout payment not completed');
      }
      throw new Error('Payment not completed');
    }

    if (!orderId) throw new Error('Order id missing from payment intent metadata');

    const stripeShippingAddress = mapPaymentIntentShipping(paymentIntent);
    const updatedOrder = await orderService.confirmPayment(
      orderId,
      'PROCESSING',
      'PAID',
      stripeShippingAddress,
    );

    return updatedOrder;
  }
}

export default new PaymentsService();
