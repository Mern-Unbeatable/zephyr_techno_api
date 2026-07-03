import AuthService from '../services/auth.service.js';
import asyncHandler from '../utils/async-handler.js';

/**
 * Arrow class fields auto-bind `this` — no manual .bind() calls needed.
 * asyncHandler wraps each method so try/catch is never repeated.
 */
class AuthController {
  constructor(authService = new AuthService()) {
    this.authService = authService;
  }

  register = asyncHandler(async (req, res) => {
    const result = await this.authService.register(req.body);
    res.status(201).json({ success: true, ...result });
  });

  verifyEmail = asyncHandler(async (req, res) => {
    const result = await this.authService.verifyEmail(req.body);
    res.status(200).json({ success: true, ...result });
  });

  login = asyncHandler(async (req, res) => {
    const result = await this.authService.login(req.body);
    res.status(200).json({ success: true, ...result });
  });

  forgotPassword = asyncHandler(async (req, res) => {
    const result = await this.authService.forgotPassword(req.body);
    res.status(200).json({ success: true, ...result });
  });

  verifyResetOtp = asyncHandler(async (req, res) => {
    const result = await this.authService.verifyResetOtp(req.body);
    res.status(200).json({ success: true, ...result });
  });

  resetPassword = asyncHandler(async (req, res) => {
    const result = await this.authService.resetPassword(req.body);
    res.status(200).json({ success: true, ...result });
  });

  resendOtp = asyncHandler(async (req, res) => {
    const result = await this.authService.resendOtp(req.body);
    res.status(200).json({ success: true, ...result });
  });

  /**
   * POST /api/auth/change-password
   * Body: { currentPassword, newPassword }
   */
  changePassword = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ success: false, message: 'currentPassword and newPassword are required' });

    const result = await this.authService.changePassword(userId, currentPassword, newPassword);
    res.status(200).json({ success: true, ...result });
  });
}

export default new AuthController();