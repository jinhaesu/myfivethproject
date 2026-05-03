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

const PAD: Record<Pad, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
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
        'rounded-lg',
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
    <div className={cn('flex items-start justify-between gap-3 mb-3', className)}>
      <div>
        <div className="text-[var(--text-1)] font-semibold tracking-tight">{title}</div>
        {subtitle ? (
          <div className="text-[var(--text-3)] text-[12.5px] mt-0.5">{subtitle}</div>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
