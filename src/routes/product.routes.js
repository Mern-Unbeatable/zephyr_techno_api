import { Router } from 'express';
import productController from '../controllers/product.controller.js';
import paymentsController from '../controllers/payments.controller.js';
import attributesController from '../controllers/attributes.controller.js';
import promoController from '../controllers/promo.controller.js';
import { authenticate, adminGuard, optionalAuthenticate } from '../middleware/auth.middleware.js';
import upload from '../middleware/upload.middleware.js';

// Public product routes
const publicRouter = Router();
publicRouter.get('/attributes', attributesController.getPublicProductAttributes);
publicRouter.get('/:id', productController.getProductById);
publicRouter.get('/', productController.getAllProducts);
publicRouter.post('/promo/validate', optionalAuthenticate, promoController.validatePromoCode);
publicRouter.post('/checkout', optionalAuthenticate, paymentsController.createCheckoutSession);
publicRouter.post('/checkout/confirm', paymentsController.confirmCheckoutSession);

// Admin product routes
const adminRouter = Router();
adminRouter.use(authenticate, adminGuard);
adminRouter.post('/', upload.array('images', 20), productController.createProduct);
adminRouter.get('/', productController.getAllProducts);
adminRouter.get('/:id', productController.getProductById);
adminRouter.patch('/:id', upload.array('images', 20), productController.updateProduct);
adminRouter.delete('/:id/gallery/:imageId', productController.deleteGalleryImage);
adminRouter.delete('/:id', productController.deleteProduct);
adminRouter.patch('/:id/feature', productController.changeFeatured);

export default publicRouter;
export { adminRouter };
