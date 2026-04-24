-- AlterTable: 품목제조보고서 PDF 첨부 + AI 자동 검토 결과 필드
ALTER TABLE "Label" ADD COLUMN "manufacturingReportUrl" TEXT;
ALTER TABLE "Label" ADD COLUMN "manufacturingReportName" TEXT;
ALTER TABLE "Label" ADD COLUMN "manufacturingReportUploadedAt" TIMESTAMP(3);
ALTER TABLE "Label" ADD COLUMN "aiDesignReview" JSONB;
ALTER TABLE "Label" ADD COLUMN "aiDesignReviewedAt" TIMESTAMP(3);
