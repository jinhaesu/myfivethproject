'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const TABS = [
  { href: '/sales', label: '영업일지', match: (p: string) => p === '/sales' || (p.startsWith('/sales/') && !p.startsWith('/sales/clients') && !p.startsWith('/sales/calendar')) },
  { href: '/sales/clients', label: '거래처', match: (p: string) => p.startsWith('/sales/clients') },
];

export default function SalesTabs() {
  const pathname = usePathname() || '';
  return (
    <div className="flex items-center gap-1 mb-5 border-b border-[var(--border-1)]">
      {TABS.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              'px-3 py-2 text-[13px] -mb-px border-b-2 transition-colors',
              active
                ? 'border-[var(--brand-500)] text-[var(--text-1)] font-medium'
                : 'border-transparent text-[var(--text-3)] hover:text-[var(--text-1)]',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
