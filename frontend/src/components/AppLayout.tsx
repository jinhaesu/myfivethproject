'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { CenterSpinner, Button } from '@/components/ui';
import { cn } from '@/lib/cn';

const NAV = [
  { href: '/dashboard', label: '대시보드' },
  { href: '/labels/new', label: '새 라벨' },
  { href: '/launches', label: '출시 관리' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      // 로그인 후 원래 가려던 화면으로 복귀 (이메일 딥링크 대응)
      const next =
        pathname && pathname !== '/' && pathname !== '/dashboard'
          ? `?next=${encodeURIComponent(pathname)}`
          : '';
      router.replace(`/login${next}`);
    }
  }, [user, loading, router, pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <CenterSpinner label="로딩 중" />
      </div>
    );
  }

  if (!user) return null;

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname?.startsWith(href);

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-30 bg-[rgba(11,12,13,0.85)] backdrop-blur-md border-b border-[var(--border-1)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-12 items-center">
            <div className="flex items-center gap-7">
              <Link href="/dashboard" className="flex items-center gap-2 group">
                <span className="inline-block w-1.5 h-5 rounded-sm bg-[var(--brand-500)] group-hover:bg-[var(--brand-400)] transition-colors" />
                <span className="text-[13px] font-semibold tracking-tight text-[var(--text-1)]">
                  제품 출시 관리 및 표기사항 검수 시스템
                </span>
                <span className="hidden lg:inline text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)] ml-1">
                  Launch &amp; Compliance Console
                </span>
              </Link>
              <div className="hidden sm:flex gap-1">
                {NAV.map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={cn(
                      'px-2.5 py-1.5 rounded-md text-[12.5px] transition-colors',
                      isActive(n.href)
                        ? 'text-[var(--text-1)] bg-[var(--bg-2)]'
                        : 'text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-2)]',
                    )}
                  >
                    {n.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline text-[12px] text-[var(--text-3)]">
                {user.name || user.email}
                {user.department ? (
                  <span className="text-[var(--text-4)] ml-1.5">/ {user.department}</span>
                ) : null}
              </span>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  logout();
                  router.push('/login');
                }}
              >
                로그아웃
              </Button>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 fade-in">
        {children}
      </main>
    </div>
  );
}
