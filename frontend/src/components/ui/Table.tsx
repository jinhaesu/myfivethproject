'use client';

import { HTMLAttributes, ReactNode, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function Table({
  className,
  ...rest
}: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="rounded-lg border border-[var(--border-1)] bg-[var(--bg-1)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className={cn('w-full text-[13px]', className)} {...rest} />
      </div>
    </div>
  );
}

export function THead({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn('bg-[var(--bg-2)] border-b border-[var(--border-1)]', className)}
      {...rest}
    />
  );
}

export function TBody({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-[var(--border-1)]', className)} {...rest} />;
}

export function TR({ className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('hover:bg-white/[0.02] transition-colors', className)}
      {...rest}
    />
  );
}

interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'right' | 'center';
  numeric?: boolean;
}

export function TH({ className, align = 'left', numeric, children, ...rest }: ThProps) {
  return (
    <th
      className={cn(
        'px-4 py-2.5 font-medium text-[11px] uppercase tracking-[0.04em] text-[var(--text-3)]',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        numeric && 'tabular text-right',
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'right' | 'center';
  numeric?: boolean;
  muted?: boolean;
  emphasis?: boolean;
}

export function TD({
  className,
  align = 'left',
  numeric,
  muted,
  emphasis,
  children,
  ...rest
}: TdProps) {
  return (
    <td
      className={cn(
        'px-4 py-2.5 text-[var(--text-2)]',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        numeric && 'tabular text-right',
        muted && 'text-[var(--text-3)]',
        emphasis && 'text-[var(--text-1)] font-medium',
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  );
}
