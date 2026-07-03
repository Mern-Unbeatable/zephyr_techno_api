import { Router } from 'express';
import orderController from '../controllers/orders.controller.js';
import { authenticate, adminGuard } from '../middleware/auth.middleware.js';

// Admin dashboard routes
const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(adminGuard);

// Returns status cards and recent orders
adminRouter.get('/overview', orderController.getDashboardOverview);

// Returns revenue overview for chart
adminRouter.get('/revenue-overview', orderController.getRevenueOverview);

export { adminRouter };
