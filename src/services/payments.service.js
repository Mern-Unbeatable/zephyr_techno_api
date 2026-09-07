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

const CHECKOUT_SHIPPING_OPTIONS = [
  {
    shipping_rate_data: {
      type: 'fixed_amount',
      fixed_amount: { amount: 0, currency: 'gbp' },
      display_name: 'Standard Delivery',
      delivery_estimate: {
        minimum: { unit: 'business_day', value: 3 },
        maximum: { unit: 'business_day', value: 5 },
      },
    },
  },
  {
    shipping_rate_data: {
      type: 'fixed_amount',
      fixed_amount: { amount: 1500, currency: 'gbp' },
      display_name: 'Express Delivery',
      delivery_estimate: {
        minimum: { unit: 'business_day', value: 1 },
        maximum: { unit: 'business_day', value: 2 },
      },
    },
  },
];

function mapStripeShippingSelection(session) {
  const amountPence = session.shipping_cost?.amount_total;
  const rate = session.shipping_cost?.shipping_rate;
  const displayName =
    (typeof rate === 'object' && rate?.display_name) ||
    session.shipping_details?.carrier ||
    null;

  if (amountPence == null && !displayName) return null;

  const cost = Number(amountPence || 0) / 100;
  return {
    method: displayName || (cost >= 15 ? 'Express Delivery' : 'Standard Delivery'),
    cost,
  };
}

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
  const charge =
    typeof paymentIntent.latest_charge === 'object' && paymentIntent.latest_charge
      ? paymentIntent.latest_charge
      : paymentIntent.charges?.data?.[0] || null;

  const shipping = paymentIntent.shipping || charge?.shipping || {};
  const addr = shipping.address || {};

  const paymentMethod =
    typeof paymentIntent.payment_method === 'object' ? paymentIntent.payment_method : null;
  const paymentMethodShipping = paymentMethod?.shipping || {};
  const pmAddr = paymentMethodShipping.address || {};

  const billing =
    charge?.billing_details ||
    paymentMethod?.billing_details ||
    {};
  const billAddr = billing.address || {};

  // PayPal / Klarna sometimes only surface payer data on the payment method
  // details block instead of `charge.shipping`. Pull whatever we can find.
  const paypalDetails = charge?.payment_method_details?.paypal || {};
  const klarnaDetails = charge?.payment_method_details?.klarna || {};

  const name =
    shipping.name ||
    paymentMethodShipping.name ||
    billing.name ||
    paypalDetails.payer_name ||
    klarnaDetails.payer_name ||
    null;
  const line1 = addr.line1 || pmAddr.line1 || billAddr.line1;
  const line2 = addr.line2 || pmAddr.line2 || billAddr.line2;
  const street = [line1, line2].filter(Boolean).join(', ');
  const city = addr.city || pmAddr.city || billAddr.city;
  const zipCode = addr.postal_code || pmAddr.postal_code || billAddr.postal_code;

  // Prefer real shipping/billing street; never invent an address from name alone.
  if (!street && !city && !zipCode) {
    // Nothing usable at all — bail out so callers can decide how to log/handle.
    if (!name) return null;
    return {
      email:
        billing.email ||
        paypalDetails.payer_email ||
        klarnaDetails.payer_email ||
        paymentIntent.receipt_email ||
        null,
      fullName: name,
      phone: billing.phone || paymentMethodShipping.phone || null,
      street: '',
      city: null,
      state: null,
      zipCode: null,
      country: null,
    };
  }

  return {
    email:
      billing.email ||
      paypalDetails.payer_email ||
      klarnaDetails.payer_email ||
      paymentIntent.receipt_email ||
      null,
    fullName: name || 'Customer',
    phone: billing.phone || paymentMethodShipping.phone || null,
    street: street || '',
    city: city || null,
    state: addr.state || pmAddr.state || billAddr.state || null,
    zipCode: zipCode || null,
    country: mapCountry(addr.country || pmAddr.country || billAddr.country),
  };
}


function mapStripeCollectedAddress(session) {
  const collectedShipping = session.collected_information?.shipping_details || null;
  const legacyShipping = session.shipping_details || session.shipping || {};
  const sessionShipping = collectedShipping || legacyShipping;
  const sessionAddr = sessionShipping?.address || {};
  const custDetails = session.customer_details || {};

  // PayPal / Klarna hosted-checkout redirects sometimes skip Stripe's own
  // address form and return the buyer's ship-to on the underlying PaymentIntent
  // (populated from the wallet). Fall back to that data if the session block
  // is empty or partial.
  const paymentIntent =
    typeof session.payment_intent === 'object' && session.payment_intent
      ? session.payment_intent
      : null;
  const piAddress = paymentIntent ? mapPaymentIntentShipping(paymentIntent) : null;

  const sessionStreet = [sessionAddr.line1, sessionAddr.line2].filter(Boolean).join(', ');

  const name = sessionShipping?.name || custDetails.name || piAddress?.fullName || null;
  const street = sessionStreet || piAddress?.street || '';
  const city = sessionAddr.city || piAddress?.city || null;
  const state = sessionAddr.state || piAddress?.state || null;
  const zipCode = sessionAddr.postal_code || piAddress?.zipCode || null;
  const countryRaw = sessionAddr.country || piAddress?.country || null;
  const phone = custDetails.phone || sessionShipping?.phone || piAddress?.phone || null;

  if (!name && !street) {
    console.error('[Stripe] No shipping name or street in session', {
      sessionId: session.id,
      paymentStatus: session.payment_status,
      hasCollectedInformation: Boolean(collectedShipping),
      hasLegacyShipping: Boolean(legacyShipping?.address),
      hasPaymentIntent: Boolean(paymentIntent),
      hasPiAddress: Boolean(piAddress),
      customerDetails: custDetails,
    });
    return null;
  }

  return {
    email: custDetails.email || session.customer_email || piAddress?.email || null,
    fullName: name || 'Customer',
    phone,
    street,
    city,
    state,
    zipCode,
    country: mapCountry(countryRaw),
  };
}

class PaymentsService {
  constructor() {
    this.stripeSecret = process.env.STRIPE_SECRET || null;
    if (this.stripeSecret) {
      this.stripe = new Stripe(this.stripeSecret, { apiVersion: '2022-11-15' });
      this.stripeCheckout = new Stripe(this.stripeSecret, { apiVersion: '2024-11-20.acacia' });
    }
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

  async #variantAllowsExpressDelivery(productId, colorId, storageOptionId) {
    if (!productId || !colorId || !storageOptionId) return true;

    const row = await prisma.productVariantStock.findUnique({
      where: {
        productId_colorId_storageOptionId: {
          productId,
          colorId,
          storageOptionId,
        },
      },
      select: { expressDeliveryEnabled: true },
    });

    if (!row) {
      const fallback = await prisma.productVariantStock.findFirst({
        where: { productId, colorId, storageOptionId },
        select: { expressDeliveryEnabled: true },
      });
      if (!fallback) return true;
      return fallback.expressDeliveryEnabled !== false;
    }

    return row.expressDeliveryEnabled !== false;
  }

  async #orderAllowsExpressDelivery(orderId, directProduct = null) {
    const lines = [];

    if (directProduct?.productId) {
      lines.push({
        productId: directProduct.productId,
        colorId: directProduct.colorId || null,
        storageOptionId: directProduct.storageOptionId || null,
      });
    }

    if (orderId) {
      const items = await prisma.orderItem.findMany({
        where: { orderId },
        select: { productId: true, colorId: true, storageOptionId: true },
      });
      for (const item of items) {
        const exists = lines.some(
          (line) =>
            line.productId === item.productId &&
            line.colorId === item.colorId &&
            line.storageOptionId === item.storageOptionId,
        );
        if (!exists) lines.push(item);
      }
    }

    if (!lines.length) return true;

    for (const line of lines) {
      const allowed = await this.#variantAllowsExpressDelivery(
        line.productId,
        line.colorId,
        line.storageOptionId,
      );
      if (!allowed) {
        console.log('[Stripe] Express Delivery hidden — variant flag is off', line);
        return false;
      }
    }

    return true;
  }

  async #checkoutShippingOptions(orderId, directProduct = null) {
    const allowExpress = await this.#orderAllowsExpressDelivery(orderId, directProduct);
    console.log('[Stripe] Express Delivery option:', allowExpress ? 'shown' : 'hidden');
    if (allowExpress) return CHECKOUT_SHIPPING_OPTIONS;
    return CHECKOUT_SHIPPING_OPTIONS.slice(0, 1);
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
    forcedPaymentMethodTypes = null,
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

    const successUrl = `${successBase}${successBase.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}&orderId=${order.id}`;
    const cancelUrl = `${cancelBase}${cancelBase.includes('?') ? '&' : '?'}orderId=${order.id}`;

    const sessionConfig = {
      mode: 'payment',
      // Do not set locale. `en-GB` / `en` make Checkout use the static UK
      // postal form with no Google Places suggestions. Browser `auto` is
      // what worked on hosted Checkout with GB-only shipping.
      adaptive_pricing: { enabled: false },
      customer_email: userEmail || undefined,
      billing_address_collection: 'auto',
      shipping_address_collection: {
        allowed_countries: ['GB'],
      },
      phone_number_collection: { enabled: true },
      allow_promotion_codes: true,
      shipping_options: await this.#checkoutShippingOptions(order.id, directProduct),
      line_items,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        orderId: order.id,
        collectAddressOnStripe: 'true',
      },
    };

    const session = await this.#createCheckoutSessionWithWallets(
      sessionConfig,
      forcedPaymentMethodTypes,
    );

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

    // Use the same API version as we create sessions with so newer fields
    // (e.g. collected_information) and expansions round-trip cleanly.
    const stripe = this.stripeCheckout || this.stripe;
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: [
        'collected_information',
        'shipping_cost.shipping_rate',
        // PayPal / Klarna often surface the buyer's ship-to on the PaymentIntent
        // rather than on the session itself — pull it back in one round-trip.
        'payment_intent',
        'payment_intent.latest_charge',
        'payment_intent.payment_method',
      ],
    });
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
    if (!stripeShippingAddress) {
      // Payment has already succeeded — never revert / abandon a paid order.
      // Return whatever we have and let admin fix the address if needed.
      console.error(
        `[Stripe] Session ${sessionId} paid but shipping address could not be extracted; returning existing order.`,
      );
      return orderService.getOrderById(orderId, null, true);
    }

    const updatedOrder = await orderService.confirmPayment(
      orderId,
      'PROCESSING',
      'PAID',
      stripeShippingAddress,
      mapStripeShippingSelection(session),
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

  async #createCheckoutSessionWithWallets(sessionConfig, forcedPaymentMethodTypes = null) {
    const stripe = this.stripeCheckout || this.stripe;
    const forced = Array.isArray(forcedPaymentMethodTypes)
      ? forcedPaymentMethodTypes.filter((type) => typeof type === 'string' && type.trim())
      : [];

    // Single-method sessions (e.g. Klarna-only) must not enable every wallet.
    if (forced.length > 0) {
      return stripe.checkout.sessions.create({
        ...sessionConfig,
        payment_method_types: forced,
      });
    }

    try {
      return await stripe.checkout.sessions.create({
        ...sessionConfig,
        automatic_payment_methods: { enabled: true },
      });
    } catch (error) {
      console.warn(
        '[Stripe] Checkout with automatic payment methods failed, falling back:',
        error.message,
      );
      try {
        return await stripe.checkout.sessions.create({
          ...sessionConfig,
          payment_method_types: ['card', 'link', 'paypal', 'klarna', 'afterpay_clearpay'],
        });
      } catch (inner) {
        const { adaptive_pricing: _adaptivePricing, ...legacyConfig } = sessionConfig;
        return this.stripe.checkout.sessions.create({
          ...legacyConfig,
          payment_method_types: ['card'],
        });
      }
    }
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
        console.log(
          `[Stripe] Wallet domain ready: ${domain_name} (apple_pay=${data.apple_pay?.status || 'registered'}, google_pay=${data.google_pay?.status || 'registered'})`,
        );
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
    shippingAddress = null,
    paymentMethodTypes = null,
  ) {
    if (!this.stripe) throw new Error('Stripe not configured. Set STRIPE_SECRET env var.');

    if (!directProduct?.productId) {
      throw new Error('directProduct with productId is required');
    }

    if (
      String(shippingMethod || '').toLowerCase().includes('express') ||
      Number(shippingCost) >= 15
    ) {
      const variant = await prisma.productVariantStock.findFirst({
        where: {
          productId: directProduct.productId,
          colorId: directProduct.colorId,
          storageOptionId: directProduct.storageOptionId,
        },
        select: { expressDeliveryEnabled: true },
      });
      if (variant && variant.expressDeliveryEnabled === false) {
        shippingMethod = 'Standard Delivery';
        shippingCost = 0;
      }
    }

    await orderService.abandonOpenUnpaidCheckouts({
      userId,
      guestEmail: userId ? null : guestEmail,
    });

    const resolvedShipping =
      shippingAddress?.street && shippingAddress?.city && shippingAddress?.zipCode
        ? {
            fullName: shippingAddress.fullName || 'Customer',
            phone: shippingAddress.phone || null,
            street: shippingAddress.street,
            city: shippingAddress.city,
            state: shippingAddress.state || null,
            zipCode: shippingAddress.zipCode,
            country: shippingAddress.country || 'United Kingdom',
          }
        : PLACEHOLDER_SHIPPING;

    const order = await orderService.createOrder(userId, guestSessionId, guestEmail, {
      shippingAddress: resolvedShipping,
      paymentMethod: 'STRIPE',
      shippingMethod,
      shippingCost: parseFloat(shippingCost) || 0,
      promoCode: null,
      directProduct,
    });

    const amountPence = Math.round(order.totalPrice * 100);
    if (amountPence < 1) throw new Error('Invalid order total');

    const stripe = this.stripeCheckout || this.stripe;
    const requestedTypes = Array.isArray(paymentMethodTypes)
      ? paymentMethodTypes.filter((type) => typeof type === 'string' && type.trim())
      : [];
    const intentParams = {
      amount: amountPence,
      currency: 'gbp',
      receipt_email: guestEmail || undefined,
      metadata: { orderId: order.id },
    };
    if (requestedTypes.length > 0) {
      // Elements collected with paymentMethodTypes cannot confirm a PI
      // that was created with automatic_payment_methods.
      intentParams.payment_method_types = requestedTypes;
    } else {
      intentParams.automatic_payment_methods = { enabled: true, allow_redirects: 'always' };
    }
    const paymentIntent = await stripe.paymentIntents.create(intentParams);

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
      expand: ['latest_charge', 'payment_method'],
    });

    if (!paymentIntent) throw new Error('Payment intent not found');

    const orderId = paymentIntent.metadata?.orderId;

    if (paymentIntent.status !== 'succeeded') {
      if (
        paymentIntent.status === 'processing' ||
        paymentIntent.status === 'requires_action' ||
        paymentIntent.status === 'requires_capture'
      ) {
        throw new Error('Payment is still processing');
      }
      if (orderId) {
        await orderService.abandonUnpaidOrder(orderId, 'Express checkout payment not completed');
      }
      throw new Error('Payment not completed');
    }

    if (!orderId) throw new Error('Order id missing from payment intent metadata');

    // Payment already succeeded — never abandon for a missing address.
    // Pull PayPal/wallet address from shipping or billing on the intent/charge.
    const stripeShippingAddress = mapPaymentIntentShipping(paymentIntent);
    if (!stripeShippingAddress) {
      console.warn(
        `[Stripe] PaymentIntent ${paymentIntentId} succeeded without extractable address; confirming with draft address.`,
      );
    }

    const updatedOrder = await orderService.confirmPayment(
      orderId,
      'PROCESSING',
      'PAID',
      stripeShippingAddress,
    );

    return updatedOrder;
  }

  /**
   * Confirm a paid order using our orderId when the browser lost session_id /
   * payment_intent from storage after a PayPal (or other) redirect.
   * Order.paymentIntentId holds either a Checkout Session id (cs_...) or PI id (pi_...).
   */
  async confirmPaidOrderByOrderId(orderId) {
    if (!this.stripe) throw new Error('Stripe not configured. Set STRIPE_SECRET env var.');
    if (!orderId) throw new Error('orderId is required');

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        paymentStatus: true,
        paymentIntentId: true,
        isDeleted: true,
      },
    });

    if (!order || order.isDeleted) {
      throw new Error('Order not found');
    }

    if (order.paymentStatus === 'PAID') {
      // Order already marked paid — but the ship-to on file may still be the
      // placeholder if the first confirm ran before Stripe had the address.
      // Re-run the appropriate confirm path to trigger the shipping backfill in
      // OrderService#confirmPayment.
      const stripeRef = order.paymentIntentId;
      if (stripeRef) {
        try {
          if (String(stripeRef).startsWith('cs_')) {
            return await this.confirmCheckoutSession(stripeRef);
          }
          if (String(stripeRef).startsWith('pi_')) {
            return await this.confirmExpressPayment(stripeRef);
          }
        } catch (error) {
          console.warn(
            `[Stripe] Paid order ${orderId} address backfill skipped:`,
            error.message,
          );
        }
      }
      return orderService.getOrderById(order.id, null, true);
    }

    const stripeRef = order.paymentIntentId;
    if (!stripeRef) {
      throw new Error('No pending Stripe session found');
    }

    if (String(stripeRef).startsWith('cs_')) {
      return this.confirmCheckoutSession(stripeRef);
    }

    if (String(stripeRef).startsWith('pi_')) {
      return this.confirmExpressPayment(stripeRef);
    }

    try {
      return await this.confirmCheckoutSession(stripeRef);
    } catch {
      return this.confirmExpressPayment(stripeRef);
    }
  }
}

export default new PaymentsService();