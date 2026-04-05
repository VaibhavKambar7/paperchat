-- CreateEnum
CREATE TYPE "DocumentProcessingStatus" AS ENUM ('QUEUED', 'PROCESSING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "Document"
ADD COLUMN "processingStatus" "DocumentProcessingStatus" NOT NULL DEFAULT 'QUEUED';

-- Backfill existing processed documents.
UPDATE "Document"
SET "processingStatus" = 'DONE'
WHERE "extractedText" IS NOT NULL;

