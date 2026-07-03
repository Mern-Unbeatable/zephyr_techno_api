-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerificationOtpExpiresAt" TIMESTAMP(3),
ADD COLUMN     "emailVerificationOtpHash" TEXT,
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordResetOtpExpiresAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetOtpHash" TEXT,
ADD COLUMN     "passwordResetOtpVerifiedAt" TIMESTAMP(3);
