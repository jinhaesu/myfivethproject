-- 마스킹된 PDF URL 및 멀티 패스 AI 추출 결과 필드
ALTER TABLE "Label" ADD COLUMN "manufacturingReportMaskedUrl" TEXT;
ALTER TABLE "Label" ADD COLUMN "aiReportExtraction" JSONB;
ALTER TABLE "Label" ADD COLUMN "aiDesignExtraction" JSONB;
