// 고시형 원료 심의 취득 관리 — 공용 타입·라벨·헬퍼
import type { BadgeProps } from '@/components/ui';

export type DeliberationStatus =
  | 'planned'
  | 'submitted'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'on_hold';
export type DeliberationCategory = 'nutrition' | 'advertising';

export interface DeliberationConfirmation {
  id: string;
  department: string;
  confirmed: boolean;
  confirmedBy: string | null;
  confirmedAt: string | null;
  note: string | null;
  sortOrder: number;
}

export interface Deliberation {
  id: string;
  labelId: string | null;
  productName: string;
  ingredientName: string;
  functionalClaim: string | null;
  category: DeliberationCategory;
  adChannel: string | null;
  reviewBody: string | null;
  title: string | null;
  proposalDate: string | null;
  resultDate: string | null;
  status: DeliberationStatus;
  resultNote: string | null;
  referenceUrl: string | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  confirmations: DeliberationConfirmation[];
  label?: { id: string; productName: string } | null;
}

export interface ScheduleEvent {
  id: string;
  deliberationId: string;
  kind: 'proposal' | 'result';
  date: string;
  productName: string;
  ingredientName: string;
  category: string;
  adChannel: string | null;
  status: DeliberationStatus;
  title: string | null;
}

type Tone = NonNullable<BadgeProps['tone']>;

export const STATUS_LABEL: Record<string, string> = {
  planned: '제안예정',
  submitted: '제안완료',
  in_review: '심의중',
  approved: '승인',
  rejected: '반려',
  on_hold: '보류',
};

export const STATUS_TONE: Record<string, Tone> = {
  planned: 'neutral',
  submitted: 'info',
  in_review: 'warning',
  approved: 'success',
  rejected: 'danger',
  on_hold: 'violet',
};

export const STATUS_ORDER: DeliberationStatus[] = [
  'planned',
  'submitted',
  'in_review',
  'approved',
  'rejected',
  'on_hold',
];

export const CATEGORY_LABEL: Record<string, string> = {
  nutrition: '영양기준',
  advertising: '광고',
};

export const AD_CHANNEL_LABEL: Record<string, string> = {
  detail_page: '상세페이지',
  homeshopping: '홈쇼핑',
  tv_cf: 'TV CF',
  sns: 'SNS·온라인',
  print: '지면·인쇄',
  etc: '기타',
};

// "광고 · 상세페이지" / "영양기준" 형태의 심의 종류 표기
export function reviewTypeLabel(d: { category: string; adChannel: string | null }): string {
  if (d.category === 'advertising') {
    return `광고 · ${AD_CHANNEL_LABEL[d.adChannel || ''] || '매체 미정'}`;
  }
  return CATEGORY_LABEL[d.category] || d.category;
}

export function confirmProgress(confs: { confirmed: boolean }[]): { done: number; total: number } {
  const total = confs.length;
  const done = confs.filter((c) => c.confirmed).length;
  return { done, total };
}

// 제안일정·결과일정 중 다가오는(오늘 이후) 가장 가까운 날짜
export function nextMilestone(d: Deliberation): { label: string; date: string } | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cands: { label: string; date: string }[] = [];
  if (d.proposalDate) cands.push({ label: '제안', date: d.proposalDate });
  if (d.resultDate) cands.push({ label: '결과', date: d.resultDate });
  const upcoming = cands
    .filter((c) => new Date(c.date) >= today)
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));
  return upcoming[0] || null;
}
