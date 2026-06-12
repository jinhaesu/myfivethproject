-- 신제품 출시 프로세스 관리
CREATE TABLE "LaunchProject" (
    "id" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productType" TEXT,
    "description" TEXT,
    "targetLaunchDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'planning',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "LaunchProject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LaunchStage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "ownerName" TEXT,
    "ownerEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dueDate" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "LaunchStage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LaunchTask" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "checkPoint" TEXT,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "stageId" TEXT NOT NULL,

    CONSTRAINT "LaunchTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LaunchNotificationLog" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "stageId" TEXT,
    "sentTo" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "LaunchNotificationLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "LaunchProject" ADD CONSTRAINT "LaunchProject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LaunchStage" ADD CONSTRAINT "LaunchStage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "LaunchProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LaunchTask" ADD CONSTRAINT "LaunchTask_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "LaunchStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LaunchNotificationLog" ADD CONSTRAINT "LaunchNotificationLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "LaunchProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
