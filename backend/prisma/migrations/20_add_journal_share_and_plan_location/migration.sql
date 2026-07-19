-- 영업일지 외부 공유 링크
ALTER TABLE "SalesJournal" ADD COLUMN "shareToken" TEXT;
ALTER TABLE "SalesJournal" ADD COLUMN "sharedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "SalesJournal_shareToken_key" ON "SalesJournal"("shareToken");

-- 영업계획 미팅 장소
ALTER TABLE "SalesPlan" ADD COLUMN "location" TEXT;

-- 명함 첨부의 원본 담당자 참조(삭제 시 원본 파일 보존용)
ALTER TABLE "SalesJournalAttachment" ADD COLUMN "sourceContactId" TEXT;
