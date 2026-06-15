'use client';

import { Badge, BadgeProps } from './Badge';

type StatusCfg = { tone: NonNullable<BadgeProps['tone']>; label: string; dot: boolean };

const MAP: Record<string, StatusCfg> = {
  draft: { tone: 'neutral', label: '초안', dot: false },
  in_review: { tone: 'warning', label: '검토 중', dot: true },
  approved: { tone: 'success', label: '승인 완료', dot: true },
  // 출시 프로젝트 상태
  planning: { tone: 'neutral', label: '기획 중', dot: false },
  in_progress: { tone: 'info', label: '진행 중', dot: true },
  completed: { tone: 'success', label: '출시 완료', dot: true },
  on_hold: { tone: 'danger', label: '보류', dot: false },
  // 출시 단계 상태
  pending: { tone: 'neutral', label: '대기', dot: false },
};

export function StatusPill({
  status,
  size = 'sm',
  kind,
}: {
  status: string;
  size?: 'xs' | 'sm' | 'md';
  kind?: string;
}) {
  const cfg = MAP[status] ?? MAP.draft;
  // 단종 프로젝트는 completed를 '단종 완료'로 표시
  const label = kind === 'discontinuation' && status === 'completed' ? '단종 완료' : cfg.label;
  return (
    <Badge tone={cfg.tone} size={size} dot={cfg.dot}>
      {label}
    </Badge>
  );
}
