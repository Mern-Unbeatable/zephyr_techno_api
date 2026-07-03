import { Router } from 'express';
import contactController from '../controllers/contact.controller.js';
import { authenticate, adminGuard } from '../middleware/auth.middleware.js';
import upload from '../middleware/upload.middleware.js';

const publicRouter = Router();
publicRouter.post('/', upload.none(), contactController.submitContact);

const adminRouter = Router();
adminRouter.use(authenticate, adminGuard);
adminRouter.get('/', contactController.getAllContacts);
adminRouter.get('/:id', contactController.getContactById);
adminRouter.patch('/:id', contactController.updateContact);
adminRouter.delete('/:id', contactController.deleteContact);

export default publicRouter;
export { adminRouter };
