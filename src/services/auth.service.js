import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomInt } from 'node:crypto';
import prisma from '../utils/prisma.js';
import Mailer from '../utils/mailer.js';
import AppError from '../utils/app-error.js';
import env from '../config/env.js';
import cartService from './cart.service.js';

/**
 * Reusable Prisma select shape that exactly matches #sanitizeUser output.
 * Avoids fetching sensitive columns (password hashes) when they aren't needed.
 */
const SANITIZE_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  isEmailVerified: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
};

class AuthService {
  /**
   * @param {Mailer} mailer - Injected mailer instance (easy to mock in tests)
   */
  constructor(mailer = new Mailer()) {
    this.mailer = mailer;
    this.passwordSaltRounds = 10;
    this.otpSaltRounds = 10;
    this.otpLength = 6;
    this.otpExpiryMinutes = env.otpExpiresMinutes;
    this.jwtSecret = env.jwtSecret;
    this.jwtExpiresIn = env.jwtExpiresIn;
  }

  async register(payload) {
    const firstName = this.#requireString(payload.firstName, 'First name');
    const lastName  = this.#requireString(payload.lastName,  'Last name');
    const email     = this.#normalizeEmail(payload.email);
    const phone     = payload.phone ? String(payload.phone).trim() : null;
    const password  = this.#requireString(payload.password, 'Password');

    if (password.length < 8) {
      throw new AppError('Password must be at least 8 characters long.', 400);
    }

    // Only fetch the two fields we actually need for this check
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { email: true, isEmailVerified: true },
    });

    if (existingUser?.isEmailVerified) {
      throw new AppError('An account with this email already exists.', 409);
    }

    const emailVerificationOtp = this.#generateOtp();
    const otpExpiresAt = this.#buildOtpExpiry();

    // Run both expensive hash operations in parallel instead of sequentially
    const [passwordHash, emailVerificationOtpHash] = await Promise.all([
      bcrypt.hash(password, this.passwordSaltRounds),
      bcrypt.hash(emailVerificationOtp, this.otpSaltRounds),
    ]);

    const userData = {
      firstName,
      lastName,
      email,
      phone,
      passwordHash,
      isEmailVerified: false,
      emailVerifiedAt: null,
      emailVerificationOtpHash,
      emailVerificationOtpExpiresAt: otpExpiresAt,
      passwordResetOtpHash: null,
      passwordResetOtpExpiresAt: null,
      passwordResetOtpVerifiedAt: null,
    };

    // Return only safe columns — no hashes ever leave the DB layer
    const user = existingUser
      ? await prisma.user.update({ where: { email }, data: userData, select: SANITIZE_SELECT })
      : await prisma.user.create({ data: userData, select: SANITIZE_SELECT });

    // Fire-and-forget: do not block the response on SMTP delivery
    this.mailer
      .sendEmailVerificationOtp({ to: user.email, otp: emailVerificationOtp, recipientName: user.firstName })
      .catch((err) => console.error('[Mailer] Failed to send verification OTP:', err));

    return {
      message: 'Registration successful. Verification OTP sent to your email.',
      user: this.#sanitizeUser(user),
    };
  }

  async verifyEmail(payload) {
    const email = this.#normalizeEmail(payload.email);
    const otp   = this.#requireString(payload.otp, 'OTP');

    // Fetch sanitize fields + OTP fields in one query
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        ...SANITIZE_SELECT,
        emailVerificationOtpHash: true,
        emailVerificationOtpExpiresAt: true,
      },
    });

    if (!user) {
      throw new AppError('Account not found.', 404);
    }

    if (user.isEmailVerified) {
      return { message: 'Email is already verified.', user: this.#sanitizeUser(user) };
    }

    await this.#validateStoredOtp({
      otp,
      storedHash: user.emailVerificationOtpHash,
      expiresAt: user.emailVerificationOtpExpiresAt,
      errorMessage: 'Invalid or expired email verification OTP.',
    });

    const updatedUser = await prisma.user.update({
      where: { email },
      data: {
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        emailVerificationOtpHash: null,
        emailVerificationOtpExpiresAt: null,
      },
      select: SANITIZE_SELECT,
    });

    return { message: 'Email verified successfully.', user: this.#sanitizeUser(updatedUser) };
  }

  async login(payload) {
    const email    = this.#normalizeEmail(payload.email);
    const password = this.#requireString(payload.password, 'Password');
    const guestSessionId = payload.guestSessionId || null; // Optional: for cart migration

    this.#requireJwtSecret();

    const user = await prisma.user.findUnique({
      where: { email },
      select: { ...SANITIZE_SELECT, passwordHash: true, status: true },
    });

    if (!user) {
      throw new AppError('No account found with this email address.', 404);
    }

    if (!user.isEmailVerified) {
      throw new AppError('Please verify your email before logging in.', 403);
    }

    if (user.status && user.status !== 'ACTIVE') {
      throw new AppError('Account is not active. Please contact support.', 403);
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new AppError('Incorrect password. Please try again.', 401);
    }

    const accessToken = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      this.jwtSecret,
      { expiresIn: this.jwtExpiresIn },
    );

    // Migrate guest cart to authenticated user's cart (if guest session exists)
    if (guestSessionId) {
      await cartService.migrateGuestCartToUser(guestSessionId, user.id);
    }

    return {
      message: 'Login successful.',
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.jwtExpiresIn,
      user: this.#sanitizeUser(user),
    };
  }

  async forgotPassword(payload) {
    const email = this.#normalizeEmail(payload.email);

    // Only the two fields needed for the mailer — nothing sensitive
    const user = await prisma.user.findUnique({
      where: { email },
      select: { email: true, firstName: true },
    });

    // Return generic message regardless — prevents user-enumeration
    if (!user) {
      return { message: 'If the account exists, a password reset OTP has been sent.' };
    }

    const resetOtp     = this.#generateOtp();
    const resetOtpHash = await bcrypt.hash(resetOtp, this.otpSaltRounds);

    await prisma.user.update({
      where: { email },
      data: {
        passwordResetOtpHash: resetOtpHash,
        passwordResetOtpExpiresAt: this.#buildOtpExpiry(),
        passwordResetOtpVerifiedAt: null,
      },
    });

    // Fire-and-forget
    this.mailer
      .sendPasswordResetOtp({ to: user.email, otp: resetOtp, recipientName: user.firstName })
      .catch((err) => console.error('[Mailer] Failed to send password reset OTP:', err));

    return { message: 'If the account exists, a password reset OTP has been sent.' };
  }

  async verifyResetOtp(payload) {
    const email = this.#normalizeEmail(payload.email);
    const otp   = this.#requireString(payload.otp, 'OTP');

    // Only OTP fields — no password hash or personal data needed
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        email: true,
        passwordResetOtpHash: true,
        passwordResetOtpExpiresAt: true,
      },
    });

    if (!user) {
      throw new AppError('Invalid or expired password reset OTP.', 400);
    }

    await this.#validateStoredOtp({
      otp,
      storedHash: user.passwordResetOtpHash,
      expiresAt: user.passwordResetOtpExpiresAt,
      errorMessage: 'Invalid or expired password reset OTP.',
    });

    await prisma.user.update({
      where: { email },
      data: { passwordResetOtpVerifiedAt: new Date() },
    });

    return { message: 'OTP verified successfully. You can now reset your password.' };
  }

  async resetPassword(payload) {
    const email       = this.#normalizeEmail(payload.email);
    const newPassword = this.#requireString(payload.newPassword, 'New password');

    if (newPassword.length < 8) {
      throw new AppError('New password must be at least 8 characters long.', 400);
    }

    // Only the reset-OTP guard fields — avoids pulling all columns
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        email: true,
        passwordResetOtpVerifiedAt: true,
        passwordResetOtpExpiresAt: true,
        passwordResetOtpHash: true,
      },
    });

    if (!user) {
      throw new AppError('Account not found.', 404);
    }

    if (!user.passwordResetOtpVerifiedAt || !user.passwordResetOtpExpiresAt || !user.passwordResetOtpHash) {
      throw new AppError('Please verify the reset OTP before resetting your password.', 400);
    }

    if (user.passwordResetOtpExpiresAt < new Date()) {
      throw new AppError('Password reset OTP has expired.', 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, this.passwordSaltRounds);

    const updatedUser = await prisma.user.update({
      where: { email },
      data: {
        passwordHash,
        passwordResetOtpHash: null,
        passwordResetOtpExpiresAt: null,
        passwordResetOtpVerifiedAt: null,
      },
      select: SANITIZE_SELECT,
    });

    return { message: 'Password reset successfully.', user: this.#sanitizeUser(updatedUser) };
  }

  /**
   * Change password for an authenticated user.
   * @param {string} userId
   * @param {string} currentPassword
   * @param {string} newPassword
   */
  async changePassword(userId, currentPassword, newPassword) {
    if (!newPassword || newPassword.length < 8) throw new AppError('New password must be at least 8 characters long.', 400);

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user) throw new AppError('User not found', 404);

    const matches = await bcrypt.compare(currentPassword || '', user.passwordHash);
    if (!matches) throw new AppError('Current password is incorrect', 401);

    const passwordHash = await bcrypt.hash(newPassword, this.passwordSaltRounds);

    const updated = await prisma.user.update({ where: { id: userId }, data: { passwordHash }, select: SANITIZE_SELECT });

    return { message: 'Password changed successfully.', user: this.#sanitizeUser(updated) };
  }

  /**
   * Single resend-OTP endpoint for both flows.
   * type: 'email-verification' | 'password-reset'
   */
  async resendOtp(payload) {
    const email = this.#normalizeEmail(payload.email);
    const type  = this.#requireString(payload.type, 'Type');

    if (type === 'email-verification') {
      return this.#resendEmailVerificationOtp(email);
    }

    if (type === 'password-reset') {
      // Reuse the existing forgotPassword logic — identical behaviour
      return this.forgotPassword({ email });
    }

    throw new AppError(
      'Invalid OTP type. Accepted values: "email-verification", "password-reset".',
      400,
    );
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  async #resendEmailVerificationOtp(email) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { email: true, firstName: true, isEmailVerified: true },
    });

    if (!user) {
      throw new AppError('Account not found.', 404);
    }

    if (user.isEmailVerified) {
      throw new AppError('This email address is already verified.', 409);
    }

    const otp       = this.#generateOtp();
    const otpHash   = await bcrypt.hash(otp, this.otpSaltRounds);
    const expiresAt = this.#buildOtpExpiry();

    await prisma.user.update({
      where: { email },
      data: {
        emailVerificationOtpHash: otpHash,
        emailVerificationOtpExpiresAt: expiresAt,
      },
    });

    // Fire-and-forget: do not block the response on SMTP delivery
    this.mailer
      .sendEmailVerificationOtp({ to: user.email, otp, recipientName: user.firstName })
      .catch((err) => console.error('[Mailer] Failed to resend verification OTP:', err));

    return { message: 'A new verification OTP has been sent to your email.' };
  }

  async #validateStoredOtp({ otp, storedHash, expiresAt, errorMessage }) {
    if (!storedHash || !expiresAt) {
      throw new AppError(errorMessage, 400);
    }

    if (expiresAt < new Date()) {
      throw new AppError(errorMessage, 400);
    }

    const matches = await bcrypt.compare(String(otp).trim(), storedHash);
    if (!matches) {
      throw new AppError(errorMessage, 400);
    }
  }

  #generateOtp() {
    const min = 10 ** (this.otpLength - 1);
    const max = 10 ** this.otpLength;
    return String(randomInt(min, max));
  }

  #requireJwtSecret() {
    if (!this.jwtSecret) {
      throw new AppError('JWT_SECRET is not configured.', 500);
    }
    return this.jwtSecret;
  }

  #buildOtpExpiry() {
    return new Date(Date.now() + this.otpExpiryMinutes * 60 * 1000);
  }

  #normalizeEmail(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      throw new AppError('Email is required.', 400);
    }
    return normalizedEmail;
  }

  #requireString(value, fieldName) {
    const result = String(value || '').trim();
    if (!result) {
      throw new AppError(`${fieldName} is required.`, 400);
    }
    return result;
  }

  #sanitizeUser(user) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

export default AuthService;