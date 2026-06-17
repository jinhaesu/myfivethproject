-- 프로젝트 편집 잠금 비밀번호 (선택)
ALTER TABLE "LaunchProject" ADD COLUMN "editPasswordHash" TEXT;
