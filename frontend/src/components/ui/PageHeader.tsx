'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-4 mb-5 sm:mb-6',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-[10.5px] uppercase tracking-[0.08em] text-[var(--text-3)] font-semibold mb-1.5">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-[21px] sm:text-[26px] font-semibold tracking-tight text-[var(--text-1)] leading-[1.22] sm:leading-[1.18] break-keep">
          {title}
        </h1>
        {description ? (
          <p className="text-[13px] text-[var(--text-3)] mt-1.5 max-w-2xl">{description}</p>
        ) : null}
      </div>
      {/* 모바일에서는 액션 버튼이 줄바꿈되며 쌓이도록 — 넘쳐서 잘리지 않게 */}
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:flex-shrink-0">{actions}</div>
      ) : null}
    </header>
  );
}
