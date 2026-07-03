import { Router } from 'express';
import businessController from '../controllers/business.controller.js';
import { authenticate, adminGuard } from '../middleware/auth.middleware.js';

const publicRouter = Router();
publicRouter.post('/', businessController.submitBusinessForm);

const adminRouter = Router();
adminRouter.use(authenticate, adminGuard);
adminRouter.get('/', businessController.getAllBusinessForms);
adminRouter.get('/:id', businessController.getBusinessFormById);
adminRouter.patch('/:id', businessController.updateBusinessForm);
adminRouter.delete('/:id', businessController.deleteBusinessForm);

export default publicRouter;
export { adminRouter };
