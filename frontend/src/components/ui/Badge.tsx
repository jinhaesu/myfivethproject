'use client';

import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'violet';
type Size = 'xs' | 'sm' | 'md';

const TONE: Record<Tone, string> = {
  neutral: 'bg-[var(--bg-3)] text-[var(--text-2)] border-[var(--border-2)]',
  brand: 'bg-[rgba(94,106,210,0.15)] text-[var(--brand-200)] border-[rgba(130,143,255,0.34)]',
  success: 'bg-[var(--success-bg)] text-[var(--success-fg)] border-[var(--success-border)]',
  warning: 'bg-[var(--warning-bg)] text-[var(--warning-fg)] border-[var(--warning-border)]',
  danger: 'bg-[var(--danger-bg)] text-[var(--danger-fg)] border-[var(--danger-border)]',
  info: 'bg-[var(--info-bg)] text-[var(--info-fg)] border-[var(--info-border)]',
  violet: 'bg-[rgba(168,85,247,0.15)] text-[#C084FC] border-[rgba(168,85,247,0.34)]',
};

const SIZE: Record<Size, string> = {
  xs: 'px-1.5 py-0.5 text-[10px]',
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2.5 py-1 text-xs',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  size?: Size;
  dot?: boolean;
  pulse?: boolean;
  children: ReactNode;
}

export function Badge({
  tone = 'neutral',
  size = 'sm',
  dot = false,
  pulse = false,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium tracking-tight',
        TONE[tone],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {dot ? (
        <span
          className={cn(
            'inline-block w-1.5 h-1.5 rounded-full bg-current',
            pulse && 'animate-pulse',
          )}
        />
      ) : null}
      {children}
    </span>
  );
}
