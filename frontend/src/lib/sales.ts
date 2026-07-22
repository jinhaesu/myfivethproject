// 영업 관리 공용 타입·상수·헬퍼

export const SALES_STAGES = [
  { key: 'lead', label: '영업 시작', order: 1 },
  { key: 'contact', label: '관계 형성', order: 2 },
  { key: 'proposal', label: '제안·미팅', order: 3 },
  { key: 'revenue', label: '매출 기여', order: 4 },
  { key: 'expansion', label: '제품 확대', order: 5 },
] as const;

export type StageKey = (typeof SALES_STAGES)[number]['key'];

export const STAGE_LABEL: Record<string, string> = Object.fromEntries(
  SALES_STAGES.map((s) => [s.key, s.label]),
);

// 영업 단계별 기본 '해야 할 일' 추천 목록 (드롭다운 기본값, '기타'는 UI에서 직접 입력)
export const STAGE_TODO_SUGGESTIONS: Record<string, string[]> = {
  lead: [
    '거래처 기본 정보·구매 담당자 파악',
    '회사·제품 소개서 준비 및 발송',
    '첫 미팅 일정 조율',
    '거래처 요구 카테고리·스펙 사전 조사',
    '경쟁사 입점 현황 파악',
  ],
  contact: [
    '샘플 제안 및 발송',
    '가격표·거래조건 1차 공유',
    '핵심 의사결정자(바이어) 관계 형성',
    '정기 커뮤니케이션 채널 수립',
    '거래처 니즈 상세 청취',
  ],
  proposal: [
    '입점 제안서 제출',
    '견적·마진 시뮬레이션 제공',
    '샘플 품평회 진행',
    '입점 조건(정산·물류·수수료) 협의',
    '제품 스펙·중량·가격대 확정 협의',
  ],
  revenue: [
    '발주(PO) 확인 및 초도 물량 생산 협의',
    '납품 일정·물류(온도·리드타임) 확정',
    '초기 판매 실적 모니터링',
    '재발주·프로모션 협의',
    '클레임·반품 대응 점검',
  ],
  expansion: [
    '신규 품목·라인 확대 제안',
    '판매 채널·지점 확장 협의',
    '연간 거래계획·볼륨 협의',
    'PB/공동기획(PNB) 제품 논의',
    '시즈널·기획전 공동 프로모션 제안',
  ],
};

// 단계 미지정 시 기본으로 보여줄 통합 추천(각 단계 대표 항목)
export const GENERIC_TODO_SUGGESTIONS: string[] = [
  '거래처 기본 정보·구매 담당자 파악',
  '샘플 제안 및 발송',
  '입점 제안서 제출',
  '견적·마진 시뮬레이션 제공',
  '발주(PO) 확인 및 초도 물량 협의',
  '납품 일정·물류 확정',
  '신규 품목·라인 확대 제안',
];

export function todoSuggestionsForStage(stage?: string | null): string[] {
  if (stage && STAGE_TODO_SUGGESTIONS[stage]) return STAGE_TODO_SUGGESTIONS[stage];
  return GENERIC_TODO_SUGGESTIONS;
}

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'violet';

export const STAGE_TONE: Record<string, BadgeTone> = {
  lead: 'neutral',
  contact: 'info',
  proposal: 'brand',
  revenue: 'success',
  expansion: 'violet',
};

// 성사 확률 기본값(거래처 winProbability 미지정 시 가중 예상매출에 사용) — 백엔드와 동일
export const STAGE_DEFAULT_PROB: Record<string, number> = {
  lead: 10,
  contact: 25,
  proposal: 50,
  revenue: 80,
  expansion: 90,
};

// 딜 진행 상태 — Pipedrive의 open/won/lost 모델 (백엔드 lib/sales.js와 동일)
export const DEAL_STATUSES = [
  { key: 'open', label: '진행 중' },
  { key: 'won', label: '성사' },
  { key: 'lost', label: '실패' },
] as const;

export type DealStatus = (typeof DEAL_STATUSES)[number]['key'];

export const DEAL_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  DEAL_STATUSES.map((s) => [s.key, s.label]),
);

export const DEAL_STATUS_TONE: Record<string, BadgeTone> = {
  open: 'neutral',
  won: 'success',
  lost: 'danger',
};

// 영업 실패(Lost) 사유 — 집계를 위해 백엔드와 같은 고정 목록을 쓴다
export const LOST_REASONS: string[] = [
  '가격 경쟁력 부족',
  '타사 계약',
  '제품 스펙 미달',
  '납기·물류 조건 불가',
  '거래처 내부 사정(예산·조직 변경)',
  '연락 두절·무응답',
  '기타',
];

// status가 비어 있는 기존 데이터는 진행 중으로 본다
export function dealStatusOf(c: { status?: string | null }): string {
  return c.status || 'open';
}

export function isOpenDeal(c: { status?: string | null }): boolean {
  return dealStatusOf(c) === 'open';
}

// 성사 확률 드롭다운 선택지 — 신규 가망뿐 아니라 이미 거래 중인 업체도 표현할 수 있어야 한다
export const WIN_PROBABILITY_OPTIONS: { value: number; label: string }[] = [
  { value: 10, label: '10%' },
  { value: 25, label: '25%' },
  { value: 50, label: '50%' },
  { value: 75, label: '75%' },
  { value: 90, label: '90%' },
  { value: 100, label: '기존 거래중 (100%)' },
];

// 미팅 목적 — 자유 입력이면 목적별 통계를 낼 수 없어 선택형으로 고정. 백엔드 MEETING_PURPOSES와 동일.
// '기타'를 고르면 화면에서 직접 입력받고, 그 텍스트가 그대로 meetingPurpose에 저장된다.
export const MEETING_PURPOSES: string[] = [
  '신규 제안',
  '견적 및 조건 협의',
  '샘플 전달',
  '정기 점검',
  '클레임 대응',
  '기타',
];

export const MEETING_PURPOSE_ETC = '기타';

// '기타'를 뺀 고정 선택지 — 저장된 값이 여기 없으면 자유 입력(과거 데이터 포함)으로 본다
export const MEETING_PURPOSE_FIXED: string[] = MEETING_PURPOSES.filter(
  (p) => p !== MEETING_PURPOSE_ETC,
);

// 원화 축약 표기 (1.2억, 3,400만, 12만 등)
export function fmtKRW(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(Number(n))) return '—';
  const v = Number(n);
  if (v === 0) return '0원';
  const eok = Math.floor(v / 100000000);
  const man = Math.round((v % 100000000) / 10000);
  if (eok > 0) return man > 0 ? `${eok}억 ${man.toLocaleString()}만원` : `${eok}억원`;
  if (v >= 10000) return `${Math.round(v / 10000).toLocaleString()}만원`;
  return `${v.toLocaleString()}원`;
}

// 가중 예상매출 = 예상매출 × (성사확률 or 단계 기본확률)
export function weightedRevenue(client: { expectedRevenue?: number | null; winProbability?: number | null; stage: string }): number {
  const exp = client.expectedRevenue || 0;
  const prob = client.winProbability != null ? client.winProbability : (STAGE_DEFAULT_PROB[client.stage] ?? 0);
  return exp * (prob / 100);
}

export interface SalesContact {
  id: string;
  name: string;
  position: string | null;
  title: string | null;
  phone: string | null;
  email: string | null;
  cardImageUrl: string | null;
  cardImageName: string | null;
  storageCondition: string | null;
  sortOrder: number;
  createdAt: string;
}

// 명함 보관 조건 — 같은 거래처라도 냉동·냉장·상온 바이어가 다르다 (예: GS25_냉장 / GS25_상온)
export const STORAGE_CONDITIONS: { key: string; label: string }[] = [
  { key: 'frozen', label: '냉동' },
  { key: 'chilled', label: '냉장' },
  { key: 'ambient', label: '상온' },
  { key: 'all', label: '전체' },
];

export const STORAGE_CONDITION_TONE: Record<string, BadgeTone> = {
  frozen: 'info',
  chilled: 'brand',
  ambient: 'warning',
  all: 'neutral',
};

// 마이그레이션 이전 명함은 값이 비어 있을 수 있다 — 숨기지 말고 '미지정'으로 드러낸다
export function storageLabel(key?: string | null): string {
  if (!key) return '미지정';
  return STORAGE_CONDITIONS.find((s) => s.key === key)?.label || key;
}

export interface UserRef {
  id: string;
  name: string | null;
  email: string;
  department: string | null;
}

export interface SalesReferrer {
  id: string;
  email: string;
}

export interface SalesTodo {
  id: string;
  dueDate: string;
  content: string;
  plan: string | null;
  isDone: boolean;
}

export interface SalesClient {
  id: string;
  name: string;
  bizNumber: string | null;
  stage: string;
  expectedRevenue: number | null;
  winProbability: number | null;
  // 파이프라인 딜 관리 (예상 계약일 · 성사/실패)
  expectedCloseDate: string | null;
  status: string; // open | won | lost
  lostReason: string | null;
  lostNote: string | null;
  closedAt: string | null;
  ownerOrg: string | null;
  buyerComposition: string | null;
  annualRevenue: string | null;
  existingVendors: string | null;
  managedItems: string | null;
  storageCondition: string | null;
  logisticsCondition: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: UserRef;
  contacts?: SalesContact[];
  journals?: SalesJournal[];
  plans?: SalesPlan[];
  _count?: { journals: number; plans: number };
}

export interface SalesQuoteItem {
  id?: string;
  productName: string;
  weightSpec: string | null;
  usp: string | null;
  flavor: string | null;
  price: string | null;
  sortOrder?: number;
}

export interface ReceivableRow {
  clientId: string;
  name: string;
  stage: string;
  months: Record<string, number>; // '1'~'12'
  total: number;
}

export interface ReceivablesData {
  year: number;
  rows: ReceivableRow[];
  monthTotals: Record<string, number>;
  grandTotal: number;
}

export interface SalesJournalAttachment {
  id: string;
  kind: string; // proposal | card | etc
  fileUrl: string;
  fileName: string;
  mimeType: string | null;
  sortOrder: number;
  sourceContactId?: string | null;
  createdAt: string;
}

export const ATTACHMENT_KIND_LABEL: Record<string, string> = {
  proposal: '제안서',
  card: '명함',
  etc: '기타',
};

export function isImageMime(mime: string | null | undefined, fileName?: string): boolean {
  if (mime && mime.startsWith('image/')) return true;
  if (fileName && /\.(png|jpe?g|webp|gif)$/i.test(fileName)) return true;
  return false;
}

export interface SalesJournal {
  id: string;
  title: string | null;
  isFirstMeeting: boolean;
  stage: string | null;
  meetingDate: string | null;
  meetingPurpose: string | null;
  meetingLocation: string | null;
  attendees: string | null;
  meetingSummary: string | null;
  keyRequests: string | null;
  productRequests: string | null;
  createdAt: string;
  updatedAt: string;
  clientId: string;
  authorId: string;
  author?: UserRef;
  client?: { id: string; name: string; stage?: string } | SalesClient;
  sampleProvided?: boolean;
  hasQuote?: boolean;
  quoteItems?: SalesQuoteItem[];
  referrers?: SalesReferrer[];
  todos?: SalesTodo[];
  attachments?: SalesJournalAttachment[];
  attachmentCount?: number;
  passwordProtected?: boolean;
  canEdit?: boolean;
  locked?: boolean;
  // 외부 공유
  shared?: boolean;
  shareToken?: string | null;
  sharedAt?: string | null;
  authorName?: string | null; // 공개(공유 링크) 응답 전용
}

export interface SalesPlan {
  id: string;
  title: string;
  planDate: string;
  content: string | null;
  location: string | null;
  stage: string | null;
  clientId: string | null;
  authorId: string;
  author?: UserRef;
  client?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export type CalendarEventType = 'launch' | 'discontinuation' | 'meeting' | 'plan' | 'todo';

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  title: string;
  date: string;
  status?: string;
  done?: boolean;
  clientId?: string | null; // 출시·단종은 거래처가 없어 null
  clientName?: string | null;
  location?: string | null; // 미팅 장소 — 구글 캘린더/.ics 내보내기에 사용
  url: string;
}

export const EVENT_META: Record<CalendarEventType, { label: string; tone: BadgeTone; color: string }> = {
  launch: { label: '출시', tone: 'info', color: 'var(--info-fg)' },
  discontinuation: { label: '단종', tone: 'danger', color: 'var(--danger-fg)' },
  meeting: { label: '미팅', tone: 'brand', color: 'var(--brand-400)' },
  plan: { label: '영업계획', tone: 'success', color: 'var(--success-fg)' },
  todo: { label: '할일', tone: 'warning', color: 'var(--warning-fg)' },
};

// 영업 대시보드 응답 타입
export interface DashboardStage {
  stage: string;
  label: string;
  count: number;
  expected: number;
  weighted: number;
}
export interface DashboardTodo {
  id: string;
  content: string;
  dueDate: string;
  clientName: string | null;
  journalId: string;
  overdue?: boolean;
}
export interface DashboardData {
  stageSummary: DashboardStage[];
  totals: { clients: number; expectedTotal: number; weightedTotal: number; openTodos: number };
  thisWeek: { meetings: number; todosUpcoming: number };
  staleClients: { id: string; name: string; stage: string; days: number }[];
  upcomingTodos: DashboardTodo[];
  recentJournals: {
    id: string; title: string | null; clientName: string | null; stage: string | null;
    authorName: string | null; authorEmail: string | null;
    createdAt: string; meetingDate: string | null;
  }[];
  isSuperAdmin: boolean;
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ko-KR');
}

export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

// 로컬 날짜를 YYYY-MM-DD로 (input[type=date]용)
export function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
