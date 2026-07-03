import { Router } from 'express';
import orderController from '../controllers/orders.controller.js';
import { authenticate, adminGuard } from '../middleware/auth.middleware.js';

// Public (user) order routes
const publicRouter = Router();
publicRouter.use(authenticate);
publicRouter.post('/', orderController.createOrder);
publicRouter.get('/', orderController.getUserOrders);
publicRouter.get('/:id', orderController.getOrderById);
publicRouter.post('/:id/cancel', orderController.cancelOrder);

// Admin order routes
const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(adminGuard);
adminRouter.get('/stats', orderController.getOrderStats);
adminRouter.get('/:id', orderController.getOrderById);
adminRouter.get('/', orderController.getAllOrders);
adminRouter.patch('/:id/status', orderController.updateOrderStatus);
adminRouter.delete('/:id', orderController.deleteOrder);

export default publicRouter;
export { adminRouter };
