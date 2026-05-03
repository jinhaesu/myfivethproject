'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-dashed border-[var(--border-2)] bg-[var(--bg-1)]',
        'flex flex-col items-center justify-center text-center px-6 py-12',
        className,
      )}
    >
      {icon ? <div className="mb-3 text-[var(--text-3)]">{icon}</div> : null}
      <h3 className="text-sm font-semibold text-[var(--text-1)]">{title}</h3>
      {description ? (
        <p className="text-[12.5px] text-[var(--text-3)] mt-1.5 max-w-sm">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
