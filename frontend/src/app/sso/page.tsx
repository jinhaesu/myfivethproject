'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CenterSpinner } from '@/components/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

function SsoCallback() {
  const { login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    // 중앙 허브가 `#token=<jwt>` 형태로 브라우저를 리다이렉트한다.
    const hash = window.location.hash || '';
    const token = new URLSearchParams(hash.replace(/^#/, '')).get('token');

    // 토큰을 URL 히스토리에서 즉시 제거(주소창/뒤로가기에 노출 방지)
    if (typeof window !== 'undefined' && hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    if (!token) {
      setError('로그인 정보를 찾을 수 없습니다. 다시 시도해주세요.');
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/sso`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({} as any));
        if (!res.ok) {
          setError(data?.error || '회사 계정 로그인에 실패했습니다.');
          return;
        }
        // 기존 로그인 흐름과 동일하게 세션 저장 후 대시보드로 이동
        login(data.token, data.user);
        router.push('/dashboard');
      } catch {
        setError('서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.');
      }
    })();
  }, [login, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <Card tone="elevated" padding="lg">
            <div className="text-center">
              <h1 className="text-[18px] font-semibold tracking-tight text-[var(--text-1)] mb-2">
                로그인 실패
              </h1>
              <p className="mb-5 p-3 rounded-md text-[12.5px] bg-[var(--danger-bg)] border border-[var(--danger-border)] text-[var(--danger-fg)]">
                {error}
              </p>
              <Link
                href="/login"
                className="text-[13px] font-medium text-[var(--brand-500)] hover:underline"
              >
                로그인 페이지로 돌아가기
              </Link>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <CenterSpinner label="회사 계정으로 로그인 중" />
    </div>
  );
}

export default function SsoPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <CenterSpinner label="로딩 중" />
        </div>
      }
    >
      <SsoCallback />
    </Suspense>
  );
}
