'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

type Theme = 'dark' | 'light';

/**
 * 라이트/다크 테마 토글 버튼.
 * - 실제 상태는 <html data-theme>와 localStorage('theme')에 저장된다.
 * - 초기 페인트 전 값은 app/layout.tsx의 인라인 스크립트가 세팅하므로(깜빡임 방지),
 *   이 컴포넌트는 마운트 후 현재 값을 읽어와 아이콘/레이블만 동기화한다.
 * - 기본 테마는 항상 'dark' (시스템 설정은 참고하지 않음).
 */
export default function ThemeToggle({
  className,
  showLabel = false,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    setTheme(current);
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem('theme', next);
    } catch {
      // localStorage 접근 불가 환경(프라이빗 모드 등) — 세션 내 토글만 유지
    }
    setTheme(next);
  };

  const isLight = mounted && theme === 'light';
  const label = isLight ? '다크 모드로 전환' : '라이트 모드로 전환';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      // 하이드레이션 전에는 서버가 렌더한 다크 아이콘을 유지 (mounted 전 깜빡임 방지)
      suppressHydrationWarning
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md text-[var(--text-2)]',
        'hover:text-[var(--text-1)] hover:bg-[var(--bg-2)] transition-colors ring-focus flex-shrink-0',
        showLabel ? 'w-full h-10 px-3 text-[13px] border border-[var(--border-2)]' : 'w-8 h-8',
        className,
      )}
    >
      {isLight ? (
        // Moon — 클릭 시 다크 모드로 전환됨을 암시
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="flex-shrink-0">
          <path
            d="M17 11.5A7 7 0 1 1 8.5 3a5.5 5.5 0 0 0 8.5 8.5Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        // Sun — 클릭 시 라이트 모드로 전환됨을 암시
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="flex-shrink-0">
          <circle cx="10" cy="10" r="3.5" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M10 2v2M10 16v2M2 10h2M16 10h2M4.5 4.5l1.4 1.4M14.1 14.1l1.4 1.4M4.5 15.5l1.4-1.4M14.1 5.9l1.4-1.4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      )}
      {showLabel ? <span>{isLight ? '다크 모드' : '라이트 모드'}</span> : null}
    </button>
  );
}
