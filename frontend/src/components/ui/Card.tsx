'use client';

import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'default' | 'elevated' | 'ghost';
type Pad = 'none' | 'sm' | 'md' | 'lg';

const TONE: Record<Tone, string> = {
  default: 'bg-[var(--bg-1)] border border-[var(--border-1)]',
  elevated: 'bg-[var(--bg-2)] border border-[var(--border-1)] shadow-elev-1',
  ghost: 'bg-transparent border border-[var(--border-1)]',
};

// 모바일에서는 좌우 여백을 한 단계 줄여 좁은 화면의 가로 폭을 본문에 더 내준다
const PAD: Record<Pad, string> = {
  none: '',
  sm: 'p-2.5 sm:p-3',
  md: 'p-3.5 sm:p-4',
  lg: 'p-4 sm:p-5',
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
  padding?: Pad;
  interactive?: boolean;
}

export function Card({
  tone = 'default',
  padding = 'md',
  interactive = false,
  className,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg min-w-0',
        TONE[tone],
        PAD[padding],
        interactive && 'hover-lift',
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row items-start sm:justify-between gap-2 sm:gap-3 mb-3',
        className,
      )}
    >
      <div className="min-w-0">
        <div className="text-[var(--text-1)] font-semibold tracking-tight">{title}</div>
        {subtitle ? (
          <div className="text-[var(--text-3)] text-[12.5px] mt-0.5">{subtitle}</div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:flex-shrink-0">{actions}</div>
      ) : null}
    </div>
  );
}
