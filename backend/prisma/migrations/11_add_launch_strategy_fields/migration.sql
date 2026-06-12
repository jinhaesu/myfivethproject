-- 출시 전략 필드 (브랜드 유형, 영업채널, 보관조건, USP, 타겟 소비기한)
ALTER TABLE "LaunchProject" ADD COLUMN "brandType" TEXT;
ALTER TABLE "LaunchProject" ADD COLUMN "salesChannels" TEXT;
ALTER TABLE "LaunchProject" ADD COLUMN "storageCondition" TEXT;
ALTER TABLE "LaunchProject" ADD COLUMN "usp" JSONB;
ALTER TABLE "LaunchProject" ADD COLUMN "targetShelfLife" TEXT;
