-- 출시 프로젝트를 거래처와 잇는다.
-- 다만 모든 출시가 특정 거래처 것은 아니다. 브랜드 공식 출시(자사 정식 라인업)는
-- 채널에 종속되지 않고, 거래처 전용(PB·전용규격)만 특정 거래처에 묶인다.
-- 이 둘을 섞으면 "이 거래처 제품"이 무의미해지므로 launchScope로 명시 구분한다.
ALTER TABLE "LaunchProject" ADD COLUMN IF NOT EXISTS "launchScope" TEXT NOT NULL DEFAULT 'brand';
ALTER TABLE "LaunchProject" ADD COLUMN IF NOT EXISTS "clientId" TEXT;

-- 브랜드 공식 출시 제품이 실제로 어느 거래처와 이어졌는지는 샘플 제안으로 남는다.
ALTER TABLE "SampleRequest" ADD COLUMN IF NOT EXISTS "clientId" TEXT;

-- 음성으로 작성한 영업일지의 받아쓰기 원문 (AI 정리본과 대조용)
ALTER TABLE "SalesJournal" ADD COLUMN IF NOT EXISTS "voiceTranscript" TEXT;

-- 거래처가 지워져도 출시 이력은 남아야 한다 → SET NULL
DO $$ BEGIN
  ALTER TABLE "LaunchProject"
    ADD CONSTRAINT "LaunchProject_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "SalesClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SampleRequest"
    ADD CONSTRAINT "SampleRequest_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "SalesClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "LaunchProject_clientId_idx" ON "LaunchProject"("clientId");
CREATE INDEX IF NOT EXISTS "SampleRequest_clientId_idx" ON "SampleRequest"("clientId");

-- 기존 프로젝트는 전부 브랜드 공식 출시로 둔다.
-- 거래처 전용이었던 건은 담당자가 화면에서 바꿔야 한다 — 제품명만 보고 추정하면
-- 남의 PB 제품을 자사 라인업으로 잘못 표기하게 된다.
UPDATE "LaunchProject" SET "launchScope" = 'brand' WHERE "launchScope" IS NULL;
