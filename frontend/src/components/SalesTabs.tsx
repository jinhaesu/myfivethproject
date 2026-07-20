'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const TABS = [
  {
    href: '/sales',
    label: '영업일지',
    match: (p: string) =>
      p === '/sales' ||
      (p.startsWith('/sales/') &&
        !p.startsWith('/sales/clients') &&
        !p.startsWith('/sales/calendar') &&
        !p.startsWith('/sales/dashboard') &&
        !p.startsWith('/sales/receivables')),
  },
  { href: '/sales/dashboard', label: '대시보드', match: (p: string) => p.startsWith('/sales/dashboard') },
  { href: '/sales/clients', label: '거래처', match: (p: string) => p.startsWith('/sales/clients') },
  { href: '/sales/receivables', label: '매출채권', match: (p: string) => p.startsWith('/sales/receivables') },
];

export default function SalesTabs() {
  const pathname = usePathname() || '';
  const activeRef = useRef<HTMLAnchorElement>(null);

  // 모바일에서 탭이 넘칠 때 선택된 탭이 화면 밖에 숨어 있지 않도록 스크롤
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [pathname]);

  return (
    <div className="touch-scroll-x no-scrollbar mb-5 border-b border-[var(--border-1)] -mx-4 px-4 sm:mx-0 sm:px-0">
      <div className="flex items-center gap-1 w-max sm:w-auto">
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              ref={active ? activeRef : undefined}
              className={cn(
                'px-3 min-h-[42px] sm:min-h-0 flex items-center py-2 text-[13px] -mb-px border-b-2 transition-colors whitespace-nowrap',
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
    </div>
  );
}
