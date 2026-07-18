-- 영업 관리: 거래처 파이프라인 + 명함 + 영업일지(참고자·비밀번호·할일) + 영업계획

CREATE TABLE "SalesClient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bizNumber" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'lead',
    "ownerOrg" TEXT,
    "buyerComposition" TEXT,
    "annualRevenue" TEXT,
    "existingVendors" TEXT,
    "managedItems" TEXT,
    "storageCondition" TEXT,
    "logisticsCondition" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "SalesClient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesContact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT,
    "title" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "cardImageUrl" TEXT,
    "cardImageName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientId" TEXT NOT NULL,

    CONSTRAINT "SalesContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesJournal" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "passwordHash" TEXT,
    "isFirstMeeting" BOOLEAN NOT NULL DEFAULT false,
    "stage" TEXT,
    "meetingDate" TIMESTAMP(3),
    "meetingPurpose" TEXT,
    "meetingLocation" TEXT,
    "attendees" TEXT,
    "meetingSummary" TEXT,
    "keyRequests" TEXT,
    "productRequests" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,

    CONSTRAINT "SalesJournal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesJournalReferrer" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "journalId" TEXT NOT NULL,

    CONSTRAINT "SalesJournalReferrer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesTodo" (
    "id" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "plan" TEXT,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "journalId" TEXT NOT NULL,

    CONSTRAINT "SalesTodo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesPlan" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "planDate" TIMESTAMP(3) NOT NULL,
    "content" TEXT,
    "stage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" TEXT NOT NULL,
    "clientId" TEXT,

    CONSTRAINT "SalesPlan_pkey" PRIMARY KEY ("id")
);

-- 인덱스 (조회 경로: 거래처별, 작성자별, 참고자 이메일, 일정)
CREATE INDEX "SalesContact_clientId_idx" ON "SalesContact"("clientId");
CREATE INDEX "SalesJournal_clientId_idx" ON "SalesJournal"("clientId");
CREATE INDEX "SalesJournal_authorId_idx" ON "SalesJournal"("authorId");
CREATE INDEX "SalesJournalReferrer_journalId_idx" ON "SalesJournalReferrer"("journalId");
CREATE INDEX "SalesJournalReferrer_email_idx" ON "SalesJournalReferrer"("email");
CREATE INDEX "SalesTodo_journalId_idx" ON "SalesTodo"("journalId");
CREATE INDEX "SalesTodo_dueDate_idx" ON "SalesTodo"("dueDate");
CREATE INDEX "SalesPlan_clientId_idx" ON "SalesPlan"("clientId");
CREATE INDEX "SalesPlan_planDate_idx" ON "SalesPlan"("planDate");

-- 외래키
ALTER TABLE "SalesClient" ADD CONSTRAINT "SalesClient_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesContact" ADD CONSTRAINT "SalesContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "SalesClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesJournal" ADD CONSTRAINT "SalesJournal_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesJournal" ADD CONSTRAINT "SalesJournal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "SalesClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesJournalReferrer" ADD CONSTRAINT "SalesJournalReferrer_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "SalesJournal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesTodo" ADD CONSTRAINT "SalesTodo_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "SalesJournal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesPlan" ADD CONSTRAINT "SalesPlan_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesPlan" ADD CONSTRAINT "SalesPlan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "SalesClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
