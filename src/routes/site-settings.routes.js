import { Router } from 'express';
import siteSettingsController from '../controllers/site-settings.controller.js';
import { authenticate, adminGuard } from '../middleware/auth.middleware.js';

const publicSiteSettingsRoutes = Router();
publicSiteSettingsRoutes.get('/maintenance', siteSettingsController.getMaintenanceMode);

const adminSiteSettingsRoutes = Router();
adminSiteSettingsRoutes.use(authenticate, adminGuard);
adminSiteSettingsRoutes.get('/maintenance', siteSettingsController.getMaintenanceMode);
adminSiteSettingsRoutes.patch('/maintenance', siteSettingsController.setMaintenanceMode);

export { publicSiteSettingsRoutes, adminSiteSettingsRoutes };
export default publicSiteSettingsRoutes;
