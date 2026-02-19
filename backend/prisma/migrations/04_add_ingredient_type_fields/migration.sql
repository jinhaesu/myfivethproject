-- AlterTable: 복합원재료/첨가물 지원 필드 추가
ALTER TABLE "Ingredient" ADD COLUMN "ingredientType" TEXT NOT NULL DEFAULT 'regular';
ALTER TABLE "Ingredient" ADD COLUMN "subIngredients" JSONB;
ALTER TABLE "Ingredient" ADD COLUMN "additivePurpose" TEXT;
