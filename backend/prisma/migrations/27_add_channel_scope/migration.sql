-- 출시 대상이 "한 거래처"와 "전 채널" 둘로만 나뉘지 않는다.
-- 편의점 계열 전용(세븐일레븐·GS25·CU 동시 대상)처럼 여러 거래처를 묶어 겨냥하는 제품이 있다.
-- 이걸 브랜드 공식 출시로 두면 채널 한정이라는 사실이 사라지고,
-- 한 거래처 전용으로 두면 나머지 거래처가 지워진다. 그래서 channel 구분을 따로 둔다.
CREATE TABLE IF NOT EXISTS "LaunchProjectClient" (
  "id"        TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "projectId" TEXT NOT NULL,
  "clientId"  TEXT NOT NULL,
  CONSTRAINT "LaunchProjectClient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LaunchProjectClient_projectId_clientId_key"
  ON "LaunchProjectClient"("projectId", "clientId");
CREATE INDEX IF NOT EXISTS "LaunchProjectClient_clientId_idx"
  ON "LaunchProjectClient"("clientId");

-- 프로젝트나 거래처가 지워지면 이 연결도 함께 사라져야 한다 (연결만 남으면 의미가 없다)
DO $$ BEGIN
  ALTER TABLE "LaunchProjectClient"
    ADD CONSTRAINT "LaunchProjectClient_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "LaunchProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LaunchProjectClient"
    ADD CONSTRAINT "LaunchProjectClient_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "SalesClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
