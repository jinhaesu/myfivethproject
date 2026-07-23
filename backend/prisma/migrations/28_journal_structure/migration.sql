-- 영업일지 필수 구성요소 추가
-- 기존 일지는 전부 NULL로 남는다. 백필하지 않는 이유: 결정사항·리스크·다음 계획은
-- 서술 본문에서 기계적으로 뽑아낼 수 없고, 잘못 뽑으면 없는 결정을 있는 것처럼 만든다.
-- 대신 완성도 점수로 보완이 필요한 일지를 드러낸다.

ALTER TABLE "SalesJournal" ADD COLUMN IF NOT EXISTS "decisions" TEXT;
ALTER TABLE "SalesJournal" ADD COLUMN IF NOT EXISTS "risks" TEXT;
ALTER TABLE "SalesJournal" ADD COLUMN IF NOT EXISTS "nextContactDate" TIMESTAMP(3);
ALTER TABLE "SalesJournal" ADD COLUMN IF NOT EXISTS "nextContactPlan" TEXT;
ALTER TABLE "SalesJournal" ADD COLUMN IF NOT EXISTS "competitorNote" TEXT;

-- 다음 접촉 예정일이 지난 건을 찾는 조회(대시보드 '방치된 거래처')를 위한 인덱스
CREATE INDEX IF NOT EXISTS "SalesJournal_nextContactDate_idx" ON "SalesJournal"("nextContactDate");
