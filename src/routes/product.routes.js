import { Router } from 'express';
import productController from '../controllers/product.controller.js';
import paymentsController from '../controllers/payments.controller.js';
import attributesController from '../controllers/attributes.controller.js';
import promoController from '../controllers/promo.controller.js';
import { authenticate, adminGuard, optionalAuthenticate } from '../middleware/auth.middleware.js';
import upload from '../middleware/upload.middleware.js';
import normalizeProductImages from '../middleware/normalize-product-images.middleware.js';

// Public product routes — specific paths MUST come before /:id
const publicRouter = Router();
publicRouter.get('/attributes', attributesController.getPublicProductAttributes);
publicRouter.get('/stripe-config', paymentsController.getStripeConfig);
publicRouter.post('/promo/validate', optionalAuthenticate, promoController.validatePromoCode);
publicRouter.post('/checkout', optionalAuthenticate, paymentsController.createCheckoutSession);
publicRouter.post('/checkout/shipping', optionalAuthenticate, paymentsController.updateCheckoutShipping);
publicRouter.post('/checkout/confirm', paymentsController.confirmCheckoutSession);
publicRouter.post('/checkout/cancel', paymentsController.cancelUnpaidCheckout);
publicRouter.post('/express-checkout/intent', optionalAuthenticate, paymentsController.createExpressPaymentIntent);
publicRouter.post('/express-checkout/confirm', paymentsController.confirmExpressPayment);
publicRouter.get('/:id', productController.getProductById);
publicRouter.get('/', productController.getAllProducts);

// Admin product routes
const adminRouter = Router();
adminRouter.use(authenticate, adminGuard);
adminRouter.post(
  '/',
  upload.array('images', 20),
  normalizeProductImages,
  productController.createProduct,
);
adminRouter.get('/', productController.getAllProducts);
adminRouter.get('/:id', productController.getProductById);
adminRouter.patch(
  '/:id',
  upload.array('images', 20),
  normalizeProductImages,
  productController.updateProduct,
);
adminRouter.delete('/:id/gallery/:imageId', productController.deleteGalleryImage);
adminRouter.delete('/:id', productController.deleteProduct);
adminRouter.patch('/:id/feature', productController.changeFeatured);

export default publicRouter;
export { adminRouter };
