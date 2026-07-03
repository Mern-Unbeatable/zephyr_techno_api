import 'dotenv/config';

// Fail fast at startup if critical environment variables are missing
const REQUIRED_VARS = ['DATABASE_URL', 'JWT_SECRET', 'MAIL_HOST', 'MAIL_USER', 'MAIL_PASS'];
for (const key of REQUIRED_VARS) {
  if (!process.env[key]) {
    throw new Error(`[Config] Missing required environment variable: ${key}`);
  }
}

const env = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  otpExpiresMinutes: Number(process.env.OTP_EXPIRES_MINUTES || 10),
  mailHost: process.env.MAIL_HOST,
  mailPort: Number(process.env.MAIL_PORT || 587),
  mailSecure: String(process.env.MAIL_SECURE).toLowerCase() === 'true',
  mailUser: process.env.MAIL_USER,
  mailPass: process.env.MAIL_PASS,
  mailFrom: process.env.MAIL_FROM || process.env.MAIL_USER,
  newsletterNotifyEmail: process.env.NEWSLETTER_NOTIFY_EMAIL,
  signatureImageBaseUrl: process.env.SIGNATURE_IMAGE_BASE_URL || process.env.LIVE_URL || '',
};

export default env;