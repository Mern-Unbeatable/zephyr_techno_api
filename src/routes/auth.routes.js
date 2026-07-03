import { Router } from 'express';
import authController from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const authRoutes = Router();

authRoutes.post('/register', authController.register);
authRoutes.post('/verify-email', authController.verifyEmail);
authRoutes.post('/login', authController.login);
authRoutes.post('/forgot-password', authController.forgotPassword);
authRoutes.post('/verify-reset-otp', authController.verifyResetOtp);
authRoutes.post('/reset-password', authController.resetPassword);
authRoutes.post('/resend-otp', authController.resendOtp);

// User password change lives under auth routes
authRoutes.post('/change-password', authenticate, authController.changePassword);

export default authRoutes;