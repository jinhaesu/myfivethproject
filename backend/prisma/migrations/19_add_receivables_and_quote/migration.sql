-- 거래처별 월별 매출채권 잔액
CREATE TABLE "SalesReceivable" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT NOT NULL,

    CONSTRAINT "SalesReceivable_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SalesReceivable_clientId_year_month_key" ON "SalesReceivable"("clientId", "year", "month");
CREATE INDEX "SalesReceivable_year_idx" ON "SalesReceivable"("year");
ALTER TABLE "SalesReceivable" ADD CONSTRAINT "SalesReceivable_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "SalesClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 영업일지: 샘플 제공여부 · 견적 제안 여부
ALTER TABLE "SalesJournal" ADD COLUMN "sampleProvided" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SalesJournal" ADD COLUMN "hasQuote" BOOLEAN NOT NULL DEFAULT false;

-- 영업일지 견적 라인아이템
CREATE TABLE "SalesQuoteItem" (
    "id" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "weightSpec" TEXT,
    "usp" TEXT,
    "flavor" TEXT,
    "price" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "journalId" TEXT NOT NULL,

    CONSTRAINT "SalesQuoteItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SalesQuoteItem_journalId_idx" ON "SalesQuoteItem"("journalId");
ALTER TABLE "SalesQuoteItem" ADD CONSTRAINT "SalesQuoteItem_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "SalesJournal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
