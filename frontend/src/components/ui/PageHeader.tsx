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
        'flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-[10.5px] uppercase tracking-[0.08em] text-[var(--text-3)] font-semibold mb-1.5">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-[26px] font-semibold tracking-tight text-[var(--text-1)] leading-[1.18]">
          {title}
        </h1>
        {description ? (
          <p className="text-[13px] text-[var(--text-3)] mt-1.5 max-w-2xl">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2 flex-shrink-0">{actions}</div> : null}
    </header>
  );
}
