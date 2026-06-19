-- CreateEnum
CREATE TYPE "RentalApplicationStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'READY_FOR_REVIEW', 'SUBMITTED', 'APPROVED', 'DENIED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('APPLICANT', 'COSIGNER');

-- CreateEnum
CREATE TYPE "ChecklistItemType" AS ENUM ('ID', 'INCOME', 'CREDIT_REPORT', 'PROOF_OF_DEPOSIT', 'OTHER');

-- CreateEnum
CREATE TYPE "ChecklistItemStatus" AS ENUM ('PENDING', 'UPLOADED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "RentalApplication" (
    "id" TEXT NOT NULL,
    "teamId" INTEGER NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "folderId" TEXT,
    "slug" TEXT NOT NULL,
    "title" TEXT,
    "status" "RentalApplicationStatus" NOT NULL DEFAULT 'OPEN',
    "unitAddress" TEXT,
    "rent" DECIMAL(65,30),
    "moveInDate" TIMESTAMP(3),
    "applicantTemplateId" TEXT,
    "cosignerTemplateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentalApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationParticipant" (
    "id" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL,
    "isStudent" BOOLEAN NOT NULL DEFAULT false,
    "linkedToId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "recipientIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "type" "ChecklistItemType" NOT NULL,
    "label" TEXT,
    "status" "ChecklistItemStatus" NOT NULL DEFAULT 'PENDING',
    "documentDataId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RentalApplication_slug_key" ON "RentalApplication"("slug");

-- CreateIndex
CREATE INDEX "RentalApplication_teamId_idx" ON "RentalApplication"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationParticipant_accessToken_key" ON "ApplicationParticipant"("accessToken");

-- CreateIndex
CREATE INDEX "ApplicationParticipant_applicationId_idx" ON "ApplicationParticipant"("applicationId");

-- CreateIndex
CREATE INDEX "ApplicationParticipant_linkedToId_idx" ON "ApplicationParticipant"("linkedToId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationParticipant_applicationId_email_key" ON "ApplicationParticipant"("applicationId", "email");

-- CreateIndex
CREATE INDEX "ChecklistItem_participantId_idx" ON "ChecklistItem"("participantId");

-- AddForeignKey
ALTER TABLE "ApplicationParticipant" ADD CONSTRAINT "ApplicationParticipant_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "RentalApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationParticipant" ADD CONSTRAINT "ApplicationParticipant_linkedToId_fkey" FOREIGN KEY ("linkedToId") REFERENCES "ApplicationParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "ApplicationParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
