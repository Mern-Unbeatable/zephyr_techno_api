-- Migration: add user status enum and field

-- 1) Add enum type
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- 2) Add column with default
ALTER TABLE "User" ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

-- Note: Adjust SQL dialect if necessary for your Postgres version.
