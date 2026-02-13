-- AlterTable: 디자인 파일 첨부 필드 추가
ALTER TABLE "Label" ADD COLUMN "designFileUrl" TEXT;
ALTER TABLE "Label" ADD COLUMN "designFileName" TEXT;
ALTER TABLE "Label" ADD COLUMN "designUploadedAt" TIMESTAMP(3);
