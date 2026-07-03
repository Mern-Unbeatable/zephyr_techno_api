import cartService from "../services/cart.service.js";
import asyncHandler from "../utils/async-handler.js";

/**
 * CartController
 * Handles HTTP requests for cart operations
 */
class CartController {
  /**
   * POST /api/cart
   * Add product to cart with selected options
   * Supports both authenticated users (via userId) and guests (via guestSessionId)
   */
  addToCart = asyncHandler(async (req, res) => {
    const userId = req.user?.id || null;
    const { guestSessionId } = req.body;

    // Either userId OR guestSessionId must be provided
    if (!userId && !guestSessionId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Either login or provide guestSessionId' 
      });
    }

    const cartItem = await cartService.addToCart(userId, guestSessionId, req.body);

    res.status(201).json({
      success: true,
      message: "Item added to cart",
      data: cartItem,
    });
  });

  /**
   * GET /api/cart
   * Get user's cart
   * Supports both authenticated users and guests
   */
  getCart = asyncHandler(async (req, res) => {
    const userId = req.user?.id || null;
    const { guestSessionId } = req.query;

    // Either userId OR guestSessionId must be provided
    if (!userId && !guestSessionId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Either login or provide guestSessionId' 
      });
    }

    const cart = await cartService.getCart(userId, guestSessionId);

    res.status(200).json({
      success: true,
      data: cart,
    });
  });

  /**
   * PATCH /api/cart/:id
   * Update cart item quantity
   * Supports both authenticated users and guests
   */
  updateCartItem = asyncHandler(async (req, res) => {
    const userId = req.user?.id || null;
    const guestSessionId = req.body?.guestSessionId || req.query.guestSessionId || null;
    const { id } = req.params;
    const { quantity } = req.body;

    // Either userId OR guestSessionId must be provided
    if (!userId && !guestSessionId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Either login or provide guestSessionId' 
      });
    }

    const updatedItem = await cartService.updateCartItemQuantity(
      userId,
      guestSessionId,
      id,
      quantity,
    );

    res.status(200).json({
      success: true,
      message: "Cart item updated",
      data: updatedItem,
    });
  });

  /**
   * DELETE /api/cart/:id
   * Remove item from cart
   * Supports both authenticated users and guests
   */
  removeCartItem = asyncHandler(async (req, res) => {
    const userId = req.user?.id || null;
    const guestSessionId = req.body?.guestSessionId || req.query.guestSessionId || null;
    const { id } = req.params;

    // Either userId OR guestSessionId must be provided
    if (!userId && !guestSessionId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Either login or provide guestSessionId' 
      });
    }

    await cartService.removeCartItem(userId, guestSessionId, id);

    res.status(200).json({
      success: true,
      message: "Item removed from cart",
    });
  });

  /**
   * DELETE /api/cart
   * Clear entire cart
   * Supports both authenticated users and guests
   */
  clearCart = asyncHandler(async (req, res) => {
    const userId = req.user?.id || null;
    const guestSessionId = req.body?.guestSessionId || req.query.guestSessionId || null;

    // Either userId OR guestSessionId must be provided
    if (!userId && !guestSessionId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Either login or provide guestSessionId' 
      });
    }

    await cartService.clearCart(userId, guestSessionId);

    res.status(200).json({
      success: true,
      message: "Cart cleared",
    });
  });

  /**
   * POST /api/cart/migrate
   * Merge guest cart into authenticated user's cart after login
   * Requires valid JWT + guestSessionId in body
   */
  migrateCart = asyncHandler(async (req, res) => {
    const userId = req.user?.id || null;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { guestSessionId } = req.body;
    if (!guestSessionId) {
      return res.status(400).json({ success: false, message: 'guestSessionId is required' });
    }

    const result = await cartService.migrateGuestCartToUser(guestSessionId, userId);

    res.status(200).json({
      success: true,
      message: 'Cart migrated successfully',
      data: result,
    });
  });
}

export default new CartController();
