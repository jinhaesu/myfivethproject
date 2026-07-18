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
