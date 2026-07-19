// 영업 관리 공용 상수·권한 헬퍼

// Pipedrive 스타일 영업 파이프라인 단계 (거래처 딜의 진행 단계)
const SALES_STAGES = [
  { key: 'lead', label: '영업 시작', order: 1 },
  { key: 'contact', label: '관계 형성', order: 2 },
  { key: 'proposal', label: '제안·미팅', order: 3 },
  { key: 'revenue', label: '매출 기여', order: 4 },
  { key: 'expansion', label: '제품 확대', order: 5 },
];
const SALES_STAGE_KEYS = SALES_STAGES.map((s) => s.key);
const STAGE_LABEL = Object.fromEntries(SALES_STAGES.map((s) => [s.key, s.label]));

// 성사 확률 기본값(거래처가 winProbability 미지정 시 가중 예상매출 산출에 사용)
const STAGE_DEFAULT_PROB = {
  lead: 10,
  contact: 25,
  proposal: 50,
  revenue: 80,
  expansion: 90,
};

// 모든 영업일지를 열람 가능한 최고 관리자
const SUPER_ADMIN_EMAIL = 'lion9080@joinandjoin.com';

function isSuperAdmin(user) {
  if (!user) return false;
  return (
    String(user.email || '').toLowerCase() === SUPER_ADMIN_EMAIL ||
    user.role === 'admin'
  );
}

// 영업일지 열람 권한: 최고관리자 · 작성자 · 참고자(이메일 일치)
function canViewJournal(user, journal) {
  if (!user || !journal) return false;
  if (isSuperAdmin(user)) return true;
  if (journal.authorId === user.id) return true;
  const email = String(user.email || '').toLowerCase();
  return (journal.referrers || []).some(
    (r) => String(r.email || '').toLowerCase() === email,
  );
}

// 편집/삭제 권한: 최고관리자 또는 작성자
function isJournalOwner(user, journal) {
  if (!user || !journal) return false;
  return isSuperAdmin(user) || journal.authorId === user.id;
}

function normalizeStage(stage) {
  return SALES_STAGE_KEYS.includes(stage) ? stage : 'lead';
}

module.exports = {
  SALES_STAGES,
  SALES_STAGE_KEYS,
  STAGE_LABEL,
  STAGE_DEFAULT_PROB,
  SUPER_ADMIN_EMAIL,
  isSuperAdmin,
  canViewJournal,
  isJournalOwner,
  normalizeStage,
};
