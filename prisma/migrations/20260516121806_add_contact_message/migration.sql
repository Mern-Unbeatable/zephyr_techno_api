/*
  Warnings:

  - The primary key for the `ContactMessage` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "ContactMessage" DROP CONSTRAINT "ContactMessage_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "deletedAt" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id");

-- RenameIndex
ALTER INDEX "idx_contactmessage_createdat" RENAME TO "ContactMessage_createdAt_idx";
