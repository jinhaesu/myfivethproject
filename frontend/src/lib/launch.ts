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

export interface LaunchProject {
  id: string;
  productName: string;
  productType: string | null;
  description: string | null;
  targetLaunchDate: string | null;
  status: string;
  createdAt: string;
  createdBy: { id: string; name: string | null; email: string; department: string | null };
  stages: LaunchStage[];
  notifications?: LaunchNotification[];
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

export const NOTIFICATION_TYPE_LABEL: Record<string, string> = {
  stage_start: '단계 시작 알림',
  manual: '수동 리마인드',
  schedule_d30: '출시 D-30 알림',
  schedule_d14: '출시 D-14 알림',
  schedule_d7: '출시 D-7 알림',
  schedule_d3: '출시 D-3 알림',
  schedule_d1: '출시 D-1 알림',
  schedule_d0: '출시 D-DAY 알림',
};

export const PRODUCT_TYPES = ['제과', '제빵', '케이크·디저트', '냉동생지', '기타'];
