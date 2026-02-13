-- AlterTable
ALTER TABLE "Label" ADD COLUMN "productType" TEXT;
ALTER TABLE "Label" ADD COLUMN "healthClaims" JSONB;
ALTER TABLE "Label" ADD COLUMN "aiNotes" JSONB;
ALTER TABLE "Label" ADD COLUMN "labelSnapshot" JSONB;
