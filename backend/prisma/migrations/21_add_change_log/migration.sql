-- 변경 이력 테이블
CREATE TABLE "ChangeLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityLabel" TEXT,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "fieldLabel" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "summary" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "actorEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChangeLog_entityType_entityId_createdAt_idx" ON "ChangeLog"("entityType", "entityId", "createdAt");
