'use client';

import { forwardRef, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Size = 'sm' | 'md' | 'lg';

// 모바일: 터치 타겟 확보(min-h)와 iOS 자동 확대 방지(16px 이상)를 함께 적용.
// 640px 이상에서는 기존 데스크톱 치수 그대로.
const SIZE_INPUT: Record<Size, string> = {
  sm: 'h-8 min-h-[40px] sm:min-h-0 px-2.5 text-[16px] sm:text-[12.5px] rounded-md',
  md: 'h-9 min-h-[44px] sm:min-h-0 px-3 text-[16px] sm:text-[13px] rounded-md',
  lg: 'h-10 min-h-[44px] sm:min-h-0 px-3.5 text-[16px] sm:text-sm rounded-md',
};

const BASE =
  'w-full bg-[var(--bg-1)] text-[var(--text-1)] border border-[var(--border-2)] ' +
  'placeholder:text-[var(--text-4)] transition-colors ' +
  'focus:outline-none focus:border-[var(--brand-500)] focus:shadow-[0_0_0_3px_rgba(94,106,210,0.18)] ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

const INVALID =
  'border-[var(--danger-border)] focus:border-[var(--danger-fg)] focus:shadow-[0_0_0_3px_rgba(248,113,113,0.18)]';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  inputSize?: Size;
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, inputSize = 'md', invalid, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(BASE, SIZE_INPUT[inputSize], invalid && INVALID, className)}
      {...rest}
    />
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  inputSize?: Size;
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, inputSize = 'md', invalid, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(BASE, SIZE_INPUT[inputSize], 'pr-7', invalid && INVALID, className)}
      {...rest}
    >
      {children}
    </select>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        BASE,
        'px-3 py-2 text-[16px] sm:text-[13px] rounded-md min-h-[88px] leading-[1.5]',
        invalid && INVALID,
        className,
      )}
      {...rest}
    />
  );
});

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <label className="text-[12.5px] font-medium text-[var(--text-2)]">
          {label}
          {required ? <span className="text-[var(--danger-fg)] ml-1">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <span className="text-[11.5px] text-[var(--danger-fg)]">{error}</span>
      ) : hint ? (
        <span className="text-[11.5px] text-[var(--text-3)]">{hint}</span>
      ) : null}
    </div>
  );
}
