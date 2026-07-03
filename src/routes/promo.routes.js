import { Router } from 'express';
import promoController from '../controllers/promo.controller.js';
import { authenticate, adminGuard } from '../middleware/auth.middleware.js';
import upload from '../middleware/upload.middleware.js';

const router = Router();

// Admin-only promo management
router.use(authenticate, adminGuard);
router.post('/', upload.none(), promoController.createPromo);
router.get('/', promoController.getAllPromos);
router.get('/:id', promoController.getPromoById);
router.patch('/:id', upload.none(), promoController.updatePromo);
router.delete('/:id', promoController.deletePromo);

export default router;
