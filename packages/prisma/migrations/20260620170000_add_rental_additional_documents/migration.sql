-- AlterTable
ALTER TABLE "ApplicationParticipant" ADD COLUMN "additionalRecipientIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
