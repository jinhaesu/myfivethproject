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

export interface SalesContact {
  id: string;
  name: string;
  position: string | null;
  title: string | null;
  phone: string | null;
  email: string | null;
  cardImageUrl: string | null;
  cardImageName: string | null;
  sortOrder: number;
  createdAt: string;
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

export interface SalesJournalAttachment {
  id: string;
  kind: string; // proposal | card | etc
  fileUrl: string;
  fileName: string;
  mimeType: string | null;
  sortOrder: number;
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
  referrers?: SalesReferrer[];
  todos?: SalesTodo[];
  attachments?: SalesJournalAttachment[];
  attachmentCount?: number;
  passwordProtected?: boolean;
  canEdit?: boolean;
  locked?: boolean;
}

export interface SalesPlan {
  id: string;
  title: string;
  planDate: string;
  content: string | null;
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
  clientName?: string | null;
  url: string;
}

export const EVENT_META: Record<CalendarEventType, { label: string; tone: BadgeTone; color: string }> = {
  launch: { label: '출시', tone: 'info', color: 'var(--info-fg)' },
  discontinuation: { label: '단종', tone: 'danger', color: 'var(--danger-fg)' },
  meeting: { label: '미팅', tone: 'brand', color: 'var(--brand-400)' },
  plan: { label: '영업계획', tone: 'success', color: 'var(--success-fg)' },
  todo: { label: '할일', tone: 'warning', color: 'var(--warning-fg)' },
};

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
