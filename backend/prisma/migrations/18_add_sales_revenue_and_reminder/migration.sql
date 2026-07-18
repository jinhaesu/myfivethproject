-- 거래처 예상매출·성사확률(가중 예상매출) + 할일 마감 알림 중복방지 플래그
ALTER TABLE "SalesClient" ADD COLUMN "expectedRevenue" DOUBLE PRECISION;
ALTER TABLE "SalesClient" ADD COLUMN "winProbability" INTEGER;
ALTER TABLE "SalesTodo" ADD COLUMN "reminderSentAt" TIMESTAMP(3);
