-- Migration: add ContactMessage table

CREATE TABLE "ContactMessage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "firstName" text NOT NULL,
  "email" text NOT NULL,
  "subject" text NOT NULL,
  "phone" text NOT NULL,
  "message" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  "isDeleted" boolean NOT NULL DEFAULT false,
  "deletedAt" timestamp
);

CREATE INDEX IF NOT EXISTS "idx_contactmessage_createdat" ON "ContactMessage" ("createdAt" DESC);
