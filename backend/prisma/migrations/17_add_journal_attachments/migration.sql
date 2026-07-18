-- 영업일지 첨부(제안서 파일·거래처 명함)
CREATE TABLE "SalesJournalAttachment" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'proposal',
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "journalId" TEXT NOT NULL,

    CONSTRAINT "SalesJournalAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SalesJournalAttachment_journalId_idx" ON "SalesJournalAttachment"("journalId");

ALTER TABLE "SalesJournalAttachment" ADD CONSTRAINT "SalesJournalAttachment_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "SalesJournal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
