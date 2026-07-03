import { Router } from 'express';
import usersController from '../controllers/users.controller.js';
import { authenticate, adminGuard } from '../middleware/auth.middleware.js';

// Public routes (exported as default)
const publicRouter = Router();
publicRouter.get('/', (req, res) => res.status(200).json({ message: 'User routes are working' }));
publicRouter.get('/me', authenticate, usersController.getProfile);
publicRouter.put('/me', authenticate, usersController.updateProfile);

// Admin routes (exported as named `adminRouter`)
const adminRouter = Router();
adminRouter.use(authenticate, adminGuard);
adminRouter.get('/', usersController.getAllUsers);
adminRouter.get('/:id', usersController.getUserById);
// Single endpoint for updates and status changes (including soft-delete)
adminRouter.patch('/:id', usersController.updateUser);

export default publicRouter;
export { adminRouter };
