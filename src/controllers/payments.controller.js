import paymentsService from '../services/payments.service.js';
import asyncHandler from '../utils/async-handler.js';

class PaymentsController {
  // POST /api/public/product/checkout
  // Support two modes:
  // 1. Cart checkout: { shippingAddress, cartItemIds, ... }
  // 2. Direct product checkout: { productId, colorId, storageOptionId, ramOptionId, quantity, shippingAddress, ... }
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

    const { shippingAddress, cartItemIds, shippingMethod, shippingCost, promoCode, productId, colorId, storageOptionId, ramOptionId, quantity } = req.body;

    // Check if direct product checkout
    let directProduct = null;
    if (productId) {
      directProduct = {
        productId,
        colorId: colorId || null,
        storageOptionId: storageOptionId || null,
        ramOptionId: ramOptionId || null,
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
}

export default new PaymentsController();
