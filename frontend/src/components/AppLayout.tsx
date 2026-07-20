'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { CenterSpinner, Button } from '@/components/ui';
import { cn } from '@/lib/cn';

const NAV = [
  { href: '/dashboard', label: '대시보드', match: (p: string) => p === '/dashboard' },
  { href: '/labels/new', label: '새 라벨', match: (p: string) => p.startsWith('/labels') },
  {
    href: '/sales',
    label: '영업 관리',
    match: (p: string) => p === '/sales' || (p.startsWith('/sales/') && !p.startsWith('/sales/calendar')),
  },
  { href: '/sales/calendar', label: '영업 캘린더', match: (p: string) => p.startsWith('/sales/calendar') },
  { href: '/launches', label: '출시 관리', match: (p: string) => p.startsWith('/launches') },
  { href: '/discontinuations', label: '단종 관리', match: (p: string) => p.startsWith('/discontinuations') },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

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

  // 화면 이동 시 모바일 메뉴 자동 닫기
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // 메뉴가 열려 있는 동안 ESC로 닫고 배경 스크롤을 잠근다
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <CenterSpinner label="로딩 중" />
      </div>
    );
  }

  if (!user) return null;

  const isActive = (item: (typeof NAV)[number]) => item.match(pathname || '');

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-30 bg-[rgba(11,12,13,0.85)] backdrop-blur-md border-b border-[var(--border-1)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-12 items-center gap-2">
            <div className="flex items-center gap-7 min-w-0">
              <Link href="/dashboard" className="flex items-center gap-2 group min-w-0">
                <span className="inline-block w-1.5 h-5 rounded-sm bg-[var(--brand-500)] group-hover:bg-[var(--brand-400)] transition-colors flex-shrink-0" />
                {/* 모바일에서는 축약 제목 — 긴 제목이 헤더를 밀어내지 않도록 */}
                <span className="sm:hidden text-[13px] font-semibold tracking-tight text-[var(--text-1)] truncate">
                  출시·검수 시스템
                </span>
                <span className="hidden sm:inline text-[13px] font-semibold tracking-tight text-[var(--text-1)] truncate">
                  제품 출시 관리 및 표기사항 검수 시스템
                </span>
                <span className="hidden lg:inline text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)] ml-1 flex-shrink-0">
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
                      isActive(n)
                        ? 'text-[var(--text-1)] bg-[var(--bg-2)]'
                        : 'text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-2)]',
                    )}
                  >
                    {n.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="hidden sm:inline text-[12px] text-[var(--text-3)]">
                {user.name || user.email}
                {user.department ? (
                  <span className="text-[var(--text-4)] ml-1.5">/ {user.department}</span>
                ) : null}
              </span>
              <div className="hidden sm:block">
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
              {/* 모바일 전용 햄버거 */}
              <button
                type="button"
                aria-label={menuOpen ? '메뉴 닫기' : '메뉴 열기'}
                aria-expanded={menuOpen}
                aria-controls="mobile-nav"
                onClick={() => setMenuOpen((v) => !v)}
                className="sm:hidden inline-flex items-center justify-center w-10 h-10 -mr-2 rounded-md text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--bg-2)] transition-colors ring-focus"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  {menuOpen ? (
                    <path
                      d="M5 5l10 10M15 5L5 15"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  ) : (
                    <path
                      d="M3 6h14M3 10h14M3 14h14"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* 모바일 메뉴 — 배경 클릭/ESC로 닫힘 */}
      {menuOpen ? (
        <div className="sm:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div
            id="mobile-nav"
            className="absolute top-0 right-0 h-full w-[78%] max-w-[300px] bg-[var(--bg-1)] border-l border-[var(--border-1)] shadow-elev-2 flex flex-col"
          >
            <div className="flex items-center justify-between h-12 px-4 border-b border-[var(--border-1)] flex-shrink-0">
              <span className="text-[12px] text-[var(--text-3)]">메뉴</span>
              <button
                type="button"
                aria-label="메뉴 닫기"
                onClick={() => setMenuOpen(false)}
                className="inline-flex items-center justify-center w-9 h-9 -mr-2 rounded-md text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-2)] transition-colors ring-focus"
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-2">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cn(
                    'flex items-center min-h-[48px] px-4 text-[14px] border-l-2 transition-colors',
                    isActive(n)
                      ? 'border-[var(--brand-500)] text-[var(--text-1)] bg-[var(--bg-2)] font-medium'
                      : 'border-transparent text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--bg-2)]',
                  )}
                >
                  {n.label}
                </Link>
              ))}
            </div>

            <div className="border-t border-[var(--border-1)] p-4 flex-shrink-0">
              <div className="text-[13px] text-[var(--text-2)] truncate">{user.name || user.email}</div>
              {user.department ? (
                <div className="text-[11.5px] text-[var(--text-4)] mt-0.5 truncate">{user.department}</div>
              ) : null}
              <Button
                variant="secondary"
                size="md"
                className="w-full mt-3"
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                  router.push('/login');
                }}
              >
                로그아웃
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 fade-in">
        {children}
      </main>
    </div>
  );
}
