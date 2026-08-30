import stockNotificationService from '../services/stock-notification.service.js';
import asyncHandler from '../utils/async-handler.js';

class StockNotificationController {
  subscribe = asyncHandler(async (req, res) => {
    const data = await stockNotificationService.subscribe({
      ...req.body,
      userId: req.user?.id || null,
    });

    res.status(201).json({
      success: true,
      message: 'You will be notified when this item is back in stock.',
      data,
    });
  });

  getAll = asyncHandler(async (req, res) => {
    const result = await stockNotificationService.getAllForAdmin(req.query);
    res.status(200).json({
      success: true,
      ...result,
    });
  });
}

export default new StockNotificationController();
