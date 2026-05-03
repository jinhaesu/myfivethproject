'use client';

import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'xs' | 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-[var(--brand-500)] hover:bg-[var(--brand-600)] active:bg-[var(--brand-700)] text-white border-transparent',
  secondary:
    'bg-[var(--bg-2)] hover:bg-[var(--bg-3)] text-[var(--text-1)] border-[var(--border-2)]',
  ghost:
    'bg-transparent hover:bg-[var(--bg-2)] text-[var(--text-2)] hover:text-[var(--text-1)] border-transparent',
  danger:
    'bg-[var(--danger-bg)] hover:bg-[rgba(248,113,113,0.18)] text-[var(--danger-fg)] border-[var(--danger-border)]',
  outline:
    'bg-transparent hover:bg-[var(--bg-2)] text-[var(--text-1)] border-[var(--border-2)]',
};

const SIZE: Record<Size, string> = {
  xs: 'h-7 px-2 text-[12px] gap-1.5',
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-4 text-sm gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'primary',
    size = 'md',
    leadingIcon,
    trailingIcon,
    loading = false,
    disabled,
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium rounded-md border transition-colors',
        'ring-focus disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        leadingIcon
      )}
      <span>{children}</span>
      {trailingIcon}
    </button>
  );
});
