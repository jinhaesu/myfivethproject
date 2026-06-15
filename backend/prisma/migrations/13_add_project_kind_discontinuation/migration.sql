-- 출시/단종 구분 + 단종 사유
ALTER TABLE "LaunchProject" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'launch';
ALTER TABLE "LaunchProject" ADD COLUMN "discontinueReason" TEXT;
