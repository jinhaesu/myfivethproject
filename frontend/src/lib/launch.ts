// 출시 프로젝트 공용 타입·헬퍼
export interface LaunchTask {
  id: string;
  name: string;
  checkPoint: string | null;
  isCompleted: boolean;
  completedBy: string | null;
  completedAt: string | null;
  note: string | null;
  sortOrder: number;
}

export interface LaunchStage {
  id: string;
  name: string;
  department: string;
  ownerName: string | null;
  ownerEmail: string | null;
  status: string;
  dueDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  sortOrder: number;
  tasks: LaunchTask[];
}

export interface LaunchNotification {
  id: string;
  type: string;
  stageId: string | null;
  sentTo: string;
  sentAt: string;
}

export interface SampleRequest {
  id: string;
  recipientName: string | null;
  recipientEmail: string;
  dueDate: string;
  quantity: string | null;
  weightSpec: string | null;
  specDetails: string | null;
  salesChannel: string | null;
  message: string | null;
  status: string;
  createdAt: string;
  requestedBy: { id: string; name: string | null; email: string; department: string | null };
}

export interface LaunchProject {
  id: string;
  kind: string; // launch | discontinuation
  productName: string;
  productType: string | null;
  weightSpec: string | null;
  description: string | null;
  targetLaunchDate: string | null;
  status: string;
  editProtected: boolean;
  discontinueReason: string | null;
  brandType: string | null;
  salesChannels: string | null;
  storageCondition: string | null;
  usp: string[] | null;
  targetShelfLife: string | null;
  createdAt: string;
  createdBy: { id: string; name: string | null; email: string; department: string | null };
  stages: LaunchStage[];
  notifications?: LaunchNotification[];
  sampleRequests?: SampleRequest[];
}

export function getDday(targetLaunchDate: string | null): number | null {
  if (!targetLaunchDate) return null;
  const target = new Date(targetLaunchDate);
  const now = new Date();
  const targetDay = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((targetDay - today) / 86400000);
}

export const STAGE_STATUS_LABEL: Record<string, string> = {
  pending: '대기',
  in_progress: '진행 중',
  completed: '완료',
};

export const SAMPLE_STATUS_LABEL: Record<string, string> = {
  requested: '요청됨',
  in_progress: '제작 중',
  delivered: '전달 완료',
  canceled: '취소',
};

export const NOTIFICATION_TYPE_LABEL: Record<string, string> = {
  stage_start: '단계 시작 알림',
  manual: '수동 리마인드',
  sample_request: '샘플 제작 요청',
  sample_delivered: '샘플 전달 완료 회신',
  schedule_d30: '출시 D-30 알림',
  schedule_d14: '출시 D-14 알림',
  schedule_d7: '출시 D-7 알림',
  schedule_d3: '출시 D-3 알림',
  schedule_d1: '출시 D-1 알림',
  schedule_d0: '출시 D-DAY 알림',
};

export const PRODUCT_TYPES = ['제과', '제빵', '케이크·디저트', '냉동생지', '기타'];

export const DISCONTINUE_REASONS = [
  '판매량 저하',
  '수익성 악화(원가 상승)',
  '품질 이슈',
  '리뉴얼·후속 제품 대체',
  '원료 수급 곤란',
  '거래처·채널 종료',
  '기타',
];

export const BRAND_TYPES = [
  { value: 'NB', label: 'NB (자사 브랜드)' },
  { value: 'PNB', label: 'PNB (공동기획 브랜드)' },
  { value: 'PB', label: 'PB (유통사 브랜드)' },
];

export const STORAGE_CONDITIONS = ['실온', '냉장', '냉동'];

export const USP_OPTIONS = [
  '고단백',
  '저당',
  '저칼로리',
  '고식이섬유',
  '개별인정형(식후혈당안정 등)',
  '글루텐프리',
  '비건',
];
