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

// 딜 진행 상태 — Pipedrive의 open/won/lost 모델
const DEAL_STATUSES = [
  { key: 'open', label: '진행 중' },
  { key: 'won', label: '성사' },
  { key: 'lost', label: '실패' },
];
const DEAL_STATUS_KEYS = DEAL_STATUSES.map((s) => s.key);

// 영업 실패(Lost) 사유 — 왜 지는지 집계해 개선점을 찾기 위해 고정 목록으로 관리
const LOST_REASONS = [
  '가격 경쟁력 부족',
  '타사 계약',
  '제품 스펙 미달',
  '납기·물류 조건 불가',
  '거래처 내부 사정(예산·조직 변경)',
  '연락 두절·무응답',
  '기타',
];

// 미팅 목적 — 자유 입력이면 집계가 불가능해 선택형으로 고정.
// '기타'를 고르면 화면에서 직접 입력받고, 그 값이 그대로 저장된다.
const MEETING_PURPOSES = [
  '신규 제안',
  '견적 및 조건 협의',
  '샘플 전달',
  '정기 점검',
  '클레임 대응',
  '기타',
];

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

function normalizeDealStatus(status) {
  return DEAL_STATUS_KEYS.includes(status) ? status : 'open';
}

module.exports = {
  SALES_STAGES,
  SALES_STAGE_KEYS,
  STAGE_LABEL,
  STAGE_DEFAULT_PROB,
  DEAL_STATUSES,
  DEAL_STATUS_KEYS,
  LOST_REASONS,
  MEETING_PURPOSES,
  normalizeDealStatus,
  SUPER_ADMIN_EMAIL,
  isSuperAdmin,
  canViewJournal,
  isJournalOwner,
  normalizeStage,
};
