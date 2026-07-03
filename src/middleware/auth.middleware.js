import jwt from 'jsonwebtoken';
import AppError from '../utils/app-error.js';

/**
 * Verifies the Bearer JWT in the Authorization header.
 * Attaches the decoded payload to req.user on success.
 */
export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authentication required. Please provide a valid token.', 401));
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    return next(new AppError('JWT_SECRET is not configured.', 500));
  }

  try {
    const decoded = jwt.verify(token, secret);
    // Normalize decoded token into req.user with `id` for convenience
    req.user = {
      ...decoded,
      id: decoded.sub || decoded.id,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Your session has expired. Please log in again.', 401));
    }
    return next(new AppError('Invalid token. Authentication failed.', 401));
  }
};

/**
 * Optional authentication — attaches req.user if a valid Bearer token is present,
 * but does NOT block the request if no token is provided (for guest-accessible routes).
 */
export const optionalAuthenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(); // no token — continue as guest
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    return next(new AppError('JWT_SECRET is not configured.', 500));
  }

  try {
    const decoded = jwt.verify(token, secret);
    req.user = { ...decoded, id: decoded.sub || decoded.id };
  } catch {
    // invalid / expired token — treat as guest
  }
  next();
};

/**
 * Allows only users with the ADMIN role.
 * Must be used AFTER authenticate middleware.
 */
export const adminGuard = (req, res, next) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return next(new AppError('Access denied. Admin privileges required.', 403));
  }
  next();
};
