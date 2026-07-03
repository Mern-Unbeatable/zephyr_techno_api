import promoService from '../services/promo.service.js';
import cartService from '../services/cart.service.js';
import asyncHandler from '../utils/async-handler.js';

class PromoController {
  createPromo = asyncHandler(async (req, res) => {
    const data = await promoService.createPromo(req.body);
    res.status(201).json({ success: true, message: 'Promo code created.', data });
  });

  getAllPromos = asyncHandler(async (req, res) => {
    const { total, data, page, limit } = await promoService.getAllPromos(req.query);
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const meta = { total, page, limit, totalPages, count: data.length, hasNext: page < totalPages, hasPrev: page > 1 };
    res.status(200).json({ success: true, data, meta });
  });

  getPromoById = asyncHandler(async (req, res) => {
    const data = await promoService.getPromoById(req.params.id);
    res.status(200).json({ success: true, data });
  });

  updatePromo = asyncHandler(async (req, res) => {
    const data = await promoService.updatePromo(req.params.id, req.body);
    res.status(200).json({ success: true, message: 'Promo updated.', data });
  });

  deletePromo = asyncHandler(async (req, res) => {
    const data = await promoService.deletePromo(req.params.id);
    res.status(200).json({ success: true, message: 'Promo deleted (soft).', data });
  });

  /**
   * POST /api/public/product/promo/validate
   * Validate promo code for user's or guest's cart
   */
  validatePromoCode = asyncHandler(async (req, res) => {
    const userId = req.user?.id || null;
    const { promoCode, cartItemIds, guestSessionId } = req.body;

    if (!userId && !guestSessionId) {
      return res.status(400).json({ success: false, message: 'Either login or provide guestSessionId' });
    }

    if (!promoCode) {
      return res.status(400).json({ success: false, message: 'Promo code is required' });
    }

    // Get cart (works for both authenticated users and guests)
    const cart = await cartService.getCart(userId, guestSessionId);

    if (!cart.items || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    // Filter cart items if specific items provided
    let itemsToValidate = cart.items;
    if (cartItemIds && cartItemIds.length > 0) {
      itemsToValidate = cart.items.filter((item) => cartItemIds.includes(item.id));
    }

    if (itemsToValidate.length === 0) {
      return res.status(400).json({ success: false, message: 'No items to validate promo code against' });
    }

    // Calculate subtotal for validation
    const subtotal = itemsToValidate.reduce((sum, item) => sum + item.total, 0);

    // Transform cart items to match expected format for promo validation
    const cartItemsForValidation = itemsToValidate.map((item) => ({
      product: {
        basePrice: item.product.basePrice,
        seriesId: item.product.seriesId,
        deviceModelId: item.product.deviceModelId,
      },
      quantity: item.quantity,
    }));

    const result = await promoService.validateAndApplyPromoCode(
      promoCode,
      cartItemsForValidation,
      subtotal,
    );

    if (result.valid) {
      return res.status(200).json({
        success: true,
        data: {
          valid: true,
          discount: result.discount,
          promoCode: result.promoCode,
          subtotal,
          finalTotal: subtotal - result.discount,
        },
        message: result.message,
      });
    } else {
      return res.status(400).json({
        success: false,
        data: { valid: false, discount: 0 },
        message: result.message,
      });
    }
  });
}

export default new PromoController();
