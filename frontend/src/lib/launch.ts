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
  clientId: string | null;
  client?: ClientBrief | null;
  requestedBy: { id: string; name: string | null; email: string; department: string | null };
}

export interface ClientBrief {
  id: string;
  name: string;
  stage?: string;
}

// 출시 대상 구분 — 대상이 '없음 / 여러 곳 / 한 곳'으로 갈린다
export const LAUNCH_SCOPES: { key: string; label: string; hint: string }[] = [
  {
    key: 'brand',
    label: '브랜드 공식 출시',
    hint: '자사 정식 라인업. 특정 거래처에 종속되지 않고 여러 채널에 제안합니다.',
  },
  {
    key: 'channel',
    label: '채널 전용',
    hint: '편의점 계열처럼 여러 거래처를 한 묶음으로 겨냥하는 제품입니다. 대상 거래처를 여러 곳 고릅니다.',
  },
  {
    key: 'client',
    label: '거래처 전용',
    hint: 'PB·전용 규격처럼 한 거래처를 위해 만드는 제품입니다.',
  },
];

export function launchScopeLabel(scope?: string | null): string {
  return LAUNCH_SCOPES.find((s) => s.key === scope)?.label || '브랜드 공식 출시';
}

export interface LaunchTargetClient {
  clientId: string;
  client?: ClientBrief | null;
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
  launchScope: string; // brand | channel | client
  clientId: string | null;
  client?: ClientBrief | null;
  targetClients?: LaunchTargetClient[]; // 채널 전용의 대상 거래처들
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

// 제품의 보관 조건(실온/냉장/냉동)을 명함의 보관 조건 키로 옮긴다.
// 같은 거래처라도 구분별로 바이어가 갈리므로, 샘플을 누구에게 보낼지 고르는 데 쓴다.
export function contactStorageKeyOf(productStorage?: string | null): string | null {
  if (!productStorage) return null;
  if (productStorage.includes('냉동')) return 'frozen';
  if (productStorage.includes('냉장')) return 'chilled';
  if (productStorage.includes('실온') || productStorage.includes('상온')) return 'ambient';
  return null;
}

export const USP_OPTIONS = [
  '고단백',
  '저당',
  '저칼로리',
  '고식이섬유',
  '개별인정형(식후혈당안정 등)',
  '글루텐프리',
  '비건',
];
