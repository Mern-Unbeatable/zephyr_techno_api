import orderService from "../services/orders.service.js";
import asyncHandler from "../utils/async-handler.js";

/**
 * OrderController
 * Handles HTTP requests for order operations
 */
class OrderController {
  /**
   * POST /api/orders
   * Create order from cart (checkout)
   */
  createOrder = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const order = await orderService.createOrder(userId, req.body);

    res.status(201).json({
      success: true,
      message: "Order created successfully",
      data: order,
    });
  });

  /**
   * GET /api/orders
   * Get user's orders
   */
  getUserOrders = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 50, 100);

    const result = await orderService.getUserOrders(userId, { ...req.query, page, limit });

    const total = result.total || 0;
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const meta = {
      total,
      page,
      limit,
      totalPages,
      count: result.data.length,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };

    res.status(200).json({ success: true, data: result.data, meta });
  });

  /**
   * GET /api/orders/:id
   * Get order details
   */
  getOrderById = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const isAdmin = req.user.role === "ADMIN";

    const order = await orderService.getOrderById(id, userId, isAdmin);

    res.status(200).json({
      success: true,
      data: order,
    });
  });

  /**
   * POST /api/orders/:id/cancel
   * Cancel order by authenticated user with a reason
   */
  cancelOrder = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 3) {
      return res.status(400).json({ success: false, message: 'Cancellation reason is required (min 3 chars)' });
    }

    const cancelled = await orderService.cancelOrderByUser(id, userId, reason);

    res.status(200).json({ success: true, message: 'Order cancelled', data: cancelled });
  });

  /**
   * GET /api/admin/orders
   * Get all orders (Admin only)
   */
  getAllOrders = asyncHandler(async (req, res) => {
    const result = await orderService.getAllOrders(req.query);

    res.status(200).json({
      success: true,
      meta: result.meta,
      data: result.data,
    });
  });

  /**
   * GET /api/admin/orders/stats
   * Get order statistics overview (Admin only)
   */
  getOrderStats = asyncHandler(async (req, res) => {
    const stats = await orderService.getOrderStats();

    res.status(200).json({
      success: true,
      data: stats,
    });
  });

  /**
   * GET /api/admin/orders/revenue-overview
   * Returns monthly revenue for the current and previous year (admin only)
   */
  getRevenueOverview = asyncHandler(async (req, res) => {
    // Optional ?year=YYYY — returns that specific year only.
    // Without it, returns both current and previous year.
    const year = req.query.year ? parseInt(req.query.year, 10) : null;
    if (year && (isNaN(year) || year < 2000 || year > 2100)) {
      return res.status(400).json({ success: false, message: 'Invalid year. Must be a 4-digit year.' });
    }

    const overview = await orderService.getRevenueOverview(year);

    res.status(200).json({ success: true, data: overview });
  });

  /**
   * GET /api/admin/orders/overview
   * Returns status card metrics and recent orders for admin dashboard
   */
  getDashboardOverview = asyncHandler(async (req, res) => {
    const data = await orderService.getDashboardOverview();
    res.status(200).json({ success: true, data });
  });

  /**
   * PATCH /api/admin/orders/:id/status
   * Update order status (Admin only)
   */
  updateOrderStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const order = await orderService.updateOrderStatus(id, status);

    res.status(200).json({
      success: true,
      message: "Order status updated",
      data: order,
    });
  });

  /**
   * DELETE /api/admin/orders/:id
   * Delete order (soft delete) - Admin only
   */
  deleteOrder = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await orderService.deleteOrder(id);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  });
}

export default new OrderController();
