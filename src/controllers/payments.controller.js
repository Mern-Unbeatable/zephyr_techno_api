import paymentsService from '../services/payments.service.js';
import asyncHandler from '../utils/async-handler.js';

class PaymentsController {
  // POST /api/public/product/checkout
  // Support two modes:
  // 1. Cart checkout: { shippingAddress, cartItemIds, ... }
  // 2. Direct product checkout: { productId, colorId, storageOptionId, quantity, shippingAddress, ... }
  // Supports both authenticated users and guest checkout
  createCheckoutSession = asyncHandler(async (req, res) => {
    const userId = req.user?.id || null; // Allow null for guest checkout
    const guestSessionId = req.body.guestSessionId || req.query.guestSessionId; // Guest session ID for cart operations
    const guestEmail = req.body.guestEmail; // Guest must provide email

    // Either userId OR guestSessionId (for guest) must be provided
    if (!userId && !guestSessionId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Either login or provide guestSessionId' 
      });
    }

    const { shippingAddress, cartItemIds, shippingMethod, shippingCost, promoCode, productId, colorId, storageOptionId, quantity, collectAddressOnStripe } = req.body;
    const collectOnStripe = Boolean(collectAddressOnStripe);

    // Guest checkout requires email unless Stripe will collect contact + address
    if (!userId && !guestEmail && !collectOnStripe) {
      return res.status(400).json({ 
        success: false, 
        message: 'Guest checkout requires guestEmail' 
      });
    }

    if (!shippingAddress && !collectOnStripe) {
      return res.status(400).json({ success: false, message: 'shippingAddress required' });
    }

    // Check if direct product checkout
    let directProduct = null;
    if (productId) {
      directProduct = {
        productId,
        colorId: colorId || null,
        storageOptionId: storageOptionId || null,
        quantity: parseInt(quantity) || 1,
      };
    }

    const { order, sessionUrl, sessionId } = await paymentsService.createCheckoutSession(
      userId,
      guestSessionId,
      guestEmail,
      shippingAddress || null,
      cartItemIds,
      shippingMethod,
      shippingCost,
      promoCode,
      directProduct,
      collectOnStripe,
    );
    res.status(201).json({ success: true, data: { orderId: order.id, checkoutUrl: sessionUrl, sessionId } });
  });

  // POST /api/public/product/checkout/confirm
  confirmCheckoutSession = asyncHandler(async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ success: false, message: 'sessionId is required' });

    const order = await paymentsService.confirmCheckoutSession(sessionId);

    res.status(200).json({ success: true, data: order });
  });

  // POST /api/public/product/checkout/cancel
  // Soft-deletes unpaid draft so it never appears as a real admin order
  cancelUnpaidCheckout = asyncHandler(async (req, res) => {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ success: false, message: 'orderId is required' });

    await paymentsService.cancelUnpaidCheckout(orderId);

    res.status(200).json({ success: true, message: 'Unpaid checkout discarded' });
  });

  getStripeConfig = asyncHandler(async (_req, res) => {
    const publishableKey = paymentsService.getPublishableKey();
    if (!publishableKey) {
      return res.status(503).json({ success: false, message: 'Stripe publishable key not configured' });
    }
    res.status(200).json({ success: true, data: { publishableKey } });
  });

  createExpressPaymentIntent = asyncHandler(async (req, res) => {
    const userId = req.user?.id || null;
    const guestSessionId = req.body.guestSessionId || req.query.guestSessionId;

    if (!userId && !guestSessionId) {
      return res.status(400).json({
        success: false,
        message: 'Either login or provide guestSessionId',
      });
    }

    const { productId, colorId, storageOptionId, quantity, shippingMethod, shippingCost, shippingAddress } = req.body;

    if (!productId) {
      return res.status(400).json({ success: false, message: 'productId is required' });
    }

    const directProduct = {
      productId,
      colorId: colorId || null,
      storageOptionId: storageOptionId || null,
      quantity: parseInt(quantity, 10) || 1,
    };

    const { order, clientSecret, paymentIntentId } = await paymentsService.createExpressPaymentIntent(
      userId,
      guestSessionId,
      req.body.guestEmail || null,
      directProduct,
      shippingMethod,
      shippingCost,
      shippingAddress || null,
    );

    res.status(201).json({
      success: true,
      data: {
        orderId: order.id,
        clientSecret,
        paymentIntentId,
        amount: order.totalPrice,
      },
    });
  });

  confirmExpressPayment = asyncHandler(async (req, res) => {
    const { paymentIntentId } = req.body;
    if (!paymentIntentId) {
      return res.status(400).json({ success: false, message: 'paymentIntentId is required' });
    }

    const order = await paymentsService.confirmExpressPayment(paymentIntentId);
    res.status(200).json({ success: true, data: order });
  });
}

export default new PaymentsController();
