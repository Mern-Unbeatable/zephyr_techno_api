-- Create ContactStatus enum and add status column to ContactMessage
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ContactStatus') THEN
        CREATE TYPE "ContactStatus" AS ENUM ('NEW','PENDING','CONTRACTED');
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
END$$;

ALTER TABLE "ContactMessage" ADD COLUMN IF NOT EXISTS "status" "ContactStatus" NOT NULL DEFAULT 'NEW';
