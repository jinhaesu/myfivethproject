'use client';

import { cn } from '@/lib/cn';

export function Spinner({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-block border-2 border-current border-t-transparent rounded-full animate-spin',
        className,
      )}
      style={{ width: size, height: size }}
      aria-label="loading"
    />
  );
}

export function CenterSpinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-[var(--text-3)]">
      <Spinner size={20} />
      {label ? <span className="text-[12.5px]">{label}</span> : null}
    </div>
  );
}
