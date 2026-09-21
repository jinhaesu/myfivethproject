-- 고시형 원료 심의 취득 관리
CREATE TABLE "Deliberation" (
    "id" TEXT NOT NULL,
    "labelId" TEXT,
    "productName" TEXT NOT NULL,
    "ingredientName" TEXT NOT NULL,
    "functionalClaim" TEXT,
    "category" TEXT NOT NULL,
    "adChannel" TEXT,
    "reviewBody" TEXT,
    "title" TEXT,
    "proposalDate" TIMESTAMP(3),
    "resultDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'planned',
    "resultNote" TEXT,
    "referenceUrl" TEXT,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "Deliberation_pkey" PRIMARY KEY ("id")
);

-- 부서간 확인
CREATE TABLE "DeliberationConfirmation" (
    "id" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deliberationId" TEXT NOT NULL,

    CONSTRAINT "DeliberationConfirmation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Deliberation_status_idx" ON "Deliberation"("status");
CREATE INDEX "Deliberation_proposalDate_idx" ON "Deliberation"("proposalDate");
CREATE INDEX "Deliberation_resultDate_idx" ON "Deliberation"("resultDate");
CREATE INDEX "DeliberationConfirmation_deliberationId_idx" ON "DeliberationConfirmation"("deliberationId");

ALTER TABLE "Deliberation" ADD CONSTRAINT "Deliberation_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Deliberation" ADD CONSTRAINT "Deliberation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliberationConfirmation" ADD CONSTRAINT "DeliberationConfirmation_deliberationId_fkey" FOREIGN KEY ("deliberationId") REFERENCES "Deliberation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
