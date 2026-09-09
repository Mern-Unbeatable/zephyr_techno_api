import siteSettingsService from '../services/site-settings.service.js';
import asyncHandler from '../utils/async-handler.js';

class SiteSettingsController {
  getMaintenanceMode = asyncHandler(async (_req, res) => {
    const data = await siteSettingsService.getMaintenanceMode();
    res.status(200).json({ success: true, data });
  });

  setMaintenanceMode = asyncHandler(async (req, res) => {
    const { enabled, message } = req.body ?? {};
    const data = await siteSettingsService.setMaintenanceMode(enabled, message);
    res.status(200).json({
      success: true,
      message: 'Maintenance mode updated.',
      data,
    });
  });
}

export default new SiteSettingsController();
