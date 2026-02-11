-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "department" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerification" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "EmailVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Label" (
    "id" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "salesChannel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "servingSize" DOUBLE PRECISION,
    "servingUnit" TEXT,
    "totalContent" DOUBLE PRECISION,
    "totalUnit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "Label_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionInfo" (
    "id" TEXT NOT NULL,
    "calories" DOUBLE PRECISION,
    "carbohydrates" DOUBLE PRECISION,
    "sugars" DOUBLE PRECISION,
    "dietaryFiber" DOUBLE PRECISION,
    "protein" DOUBLE PRECISION,
    "totalFat" DOUBLE PRECISION,
    "saturatedFat" DOUBLE PRECISION,
    "transFat" DOUBLE PRECISION,
    "cholesterol" DOUBLE PRECISION,
    "sodium" DOUBLE PRECISION,
    "vitaminA" DOUBLE PRECISION,
    "vitaminC" DOUBLE PRECISION,
    "calcium" DOUBLE PRECISION,
    "iron" DOUBLE PRECISION,
    "labelId" TEXT NOT NULL,

    CONSTRAINT "NutritionInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ratio" DOUBLE PRECISION NOT NULL,
    "origin" TEXT,
    "allergen" BOOLEAN NOT NULL DEFAULT false,
    "allergenInfo" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "labelId" TEXT NOT NULL,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "labelId" TEXT NOT NULL,

    CONSTRAINT "ReviewCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewItem" (
    "id" TEXT NOT NULL,
    "taskName" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "reviewerNote" TEXT,
    "completedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "categoryId" TEXT NOT NULL,
    "reviewerId" TEXT,

    CONSTRAINT "ReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "NutritionInfo_labelId_key" ON "NutritionInfo"("labelId");

-- AddForeignKey
ALTER TABLE "EmailVerification" ADD CONSTRAINT "EmailVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Label" ADD CONSTRAINT "Label_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionInfo" ADD CONSTRAINT "NutritionInfo_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewCategory" ADD CONSTRAINT "ReviewCategory_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ReviewCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
