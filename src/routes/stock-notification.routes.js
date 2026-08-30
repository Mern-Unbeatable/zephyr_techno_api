import { Router } from 'express';
import stockNotificationController from '../controllers/stock-notification.controller.js';
import { authenticate, adminGuard, optionalAuthenticate } from '../middleware/auth.middleware.js';

const publicRouter = Router();
publicRouter.post(
  '/',
  optionalAuthenticate,
  stockNotificationController.subscribe,
);

const adminRouter = Router();
adminRouter.use(authenticate, adminGuard);
adminRouter.get('/', stockNotificationController.getAll);

export default publicRouter;
export { adminRouter };
