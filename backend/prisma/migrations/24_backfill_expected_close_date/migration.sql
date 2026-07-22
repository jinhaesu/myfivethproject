-- 예상 계약일을 필수 입력으로 전환하면서, 이전에 등록된 빈칸을 채운다.
-- 값이 없으면 그 딜은 매출 타임라인에서 통째로 빠져 예측이 비어 보인다.
-- 실제 예상일을 모르므로 "30일 뒤"라는 명시적 임시값을 넣고, 담당자가 화면에서 조정한다.
-- 종료된 딜(won/lost)은 이미 결과가 나왔으므로 대상에서 제외한다.
UPDATE "SalesClient"
SET "expectedCloseDate" = CURRENT_DATE + INTERVAL '30 days'
WHERE "expectedCloseDate" IS NULL
  AND "status" = 'open';
