import jwt from 'jsonwebtoken';
import siteSettingsService from '../services/site-settings.service.js';

function getPathname(req) {
  const raw = req.originalUrl || req.url || req.path || '';
  return String(raw).split('?')[0];
}

function hasValidAdminJwt(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;

  const secret = process.env.JWT_SECRET;
  if (!secret) return false;

  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], secret);
    return (
      String(decoded?.role || '').toUpperCase() === 'ADMIN'
    );
  } catch {
    return false;
  }
}

/**
 * Blocks public store traffic with 503 when maintenance mode is enabled.
 * Allows admin/auth routes, maintenance status + stripe config GETs, and valid ADMIN JWTs.
 */
export const blockPublicIfMaintenance = async (req, res, next) => {
  try {
    const path = getPathname(req);

    if (path.startsWith('/api/admin') || path.startsWith('/api/auth')) {
      return next();
    }

    if (req.method === 'GET' && path === '/api/public/site-settings/maintenance') {
      return next();
    }

    if (req.method === 'GET' && path === '/api/public/stripe-config') {
      return next();
    }

    // Allow payment confirmation so customers who already paid can land on success.
    if (
      path === '/api/public/product/checkout/confirm' ||
      path === '/api/public/product/express-checkout/confirm' ||
      path === '/api/public/product/checkout/cancel'
    ) {
      return next();
    }

    if (hasValidAdminJwt(req)) {
      return next();
    }

    const { enabled } = await siteSettingsService.getMaintenanceMode();
    if (!enabled) {
      return next();
    }

    return res.status(503).json({
      success: false,
      message: 'Site is under maintenance',
      code: 'MAINTENANCE',
    });
  } catch (error) {
    return next(error);
  }
};
