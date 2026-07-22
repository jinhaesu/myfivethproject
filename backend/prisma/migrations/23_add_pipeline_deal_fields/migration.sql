-- 파이프라인 고도화: 예상 계약일, 성사/실패 상태, 실패 사유
ALTER TABLE "SalesClient" ADD COLUMN "expectedCloseDate" TIMESTAMP(3);
ALTER TABLE "SalesClient" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'open';
ALTER TABLE "SalesClient" ADD COLUMN "lostReason" TEXT;
ALTER TABLE "SalesClient" ADD COLUMN "lostNote" TEXT;
ALTER TABLE "SalesClient" ADD COLUMN "closedAt" TIMESTAMP(3);

CREATE INDEX "SalesClient_status_idx" ON "SalesClient"("status");
CREATE INDEX "SalesClient_expectedCloseDate_idx" ON "SalesClient"("expectedCloseDate");
