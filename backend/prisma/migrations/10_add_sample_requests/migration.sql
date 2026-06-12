-- 영업 선제안용 샘플 요청
CREATE TABLE "SampleRequest" (
    "id" TEXT NOT NULL,
    "recipientName" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "quantity" TEXT,
    "weightSpec" TEXT,
    "specDetails" TEXT,
    "salesChannel" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "requestedById" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "SampleRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SampleRequest" ADD CONSTRAINT "SampleRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SampleRequest" ADD CONSTRAINT "SampleRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "LaunchProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
