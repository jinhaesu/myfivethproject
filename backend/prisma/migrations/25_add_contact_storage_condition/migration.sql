-- 담당자 명함에 보관 조건(냉동/냉장/상온/전체)을 붙인다.
-- 같은 거래처라도 보관 구분별로 바이어가 갈리기 때문에, 이 값이 명함을 나누는 축이 된다.
ALTER TABLE "SalesContact" ADD COLUMN IF NOT EXISTS "storageCondition" TEXT;

-- 거래처명이나 거래처 보관조건 메모에 구분이 이미 박혀 있는 경우만 자동 추정한다.
-- (예: "GS25_냉장", "코스트코_냉동_D18", "CU_상온")
-- 근거가 없으면 비워 둔다 — 임의로 '전체'를 넣으면 확인되지 않은 값이 사실처럼 굳는다.
-- 비어 있는 건은 화면에서 '보관 조건 미지정'으로 드러나 담당자가 채우게 된다.
UPDATE "SalesContact" c
SET "storageCondition" = CASE
  WHEN cl."name" LIKE '%냉동%' OR cl."storageCondition" LIKE '%냉동%' THEN 'frozen'
  WHEN cl."name" LIKE '%냉장%' OR cl."storageCondition" LIKE '%냉장%' THEN 'chilled'
  WHEN cl."name" LIKE '%상온%' OR cl."name" LIKE '%실온%'
    OR cl."storageCondition" LIKE '%상온%' OR cl."storageCondition" LIKE '%실온%' THEN 'ambient'
END
FROM "SalesClient" cl
WHERE c."clientId" = cl."id"
  AND c."storageCondition" IS NULL;
