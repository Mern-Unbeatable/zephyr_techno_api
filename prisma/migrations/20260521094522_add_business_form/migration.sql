-- CreateEnum
CREATE TYPE "BusinessFormStatus" AS ENUM ('NEW', 'REVIEWING', 'CONTACTED', 'CLOSED');

-- CreateTable
CREATE TABLE "BusinessForm" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "requirements" TEXT NOT NULL,
    "status" "BusinessFormStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BusinessForm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessForm_createdAt_idx" ON "BusinessForm"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "BusinessForm_status_idx" ON "BusinessForm"("status");

-- CreateIndex
CREATE INDEX "BusinessForm_isDeleted_idx" ON "BusinessForm"("isDeleted");
