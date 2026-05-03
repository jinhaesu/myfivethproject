'use client';

import { Badge, BadgeProps } from './Badge';

type StatusCfg = { tone: NonNullable<BadgeProps['tone']>; label: string; dot: boolean };

const MAP: Record<string, StatusCfg> = {
  draft: { tone: 'neutral', label: '초안', dot: false },
  in_review: { tone: 'warning', label: '검토 중', dot: true },
  approved: { tone: 'success', label: '승인 완료', dot: true },
};

export function StatusPill({ status, size = 'sm' }: { status: string; size?: 'xs' | 'sm' | 'md' }) {
  const cfg = MAP[status] ?? MAP.draft;
  return (
    <Badge tone={cfg.tone} size={size} dot={cfg.dot}>
      {cfg.label}
    </Badge>
  );
}
