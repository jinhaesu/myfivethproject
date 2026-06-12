'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { Card, Button, CenterSpinner } from '@/components/ui';

function safePath(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

function MagicLoginHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [error, setError] = useState('');
  const attempted = useRef(false);

  const token = searchParams.get('token');
  const next = safePath(searchParams.get('next'));

  useEffect(() => {
    if (attempted.current) return; // StrictMode 이중 실행 방지 (1회용 토큰 보호)
    attempted.current = true;

    if (!token) {
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    (async () => {
      try {
        const data = await api.auth.magicLogin(token);
        login(data.token, data.user);
        router.replace(safePath(data.redirectPath || next));
      } catch (err: any) {
        setError(err.message || '자동 로그인에 실패했습니다.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card tone="elevated" padding="lg" className="w-full max-w-md text-center">
          <p className="text-[14px] text-[var(--text-1)] font-medium mb-2">자동 로그인 실패</p>
          <p className="text-[12.5px] text-[var(--text-3)] mb-5">{error}</p>
          <Button
            variant="primary"
            size="md"
            onClick={() => router.replace(`/login?next=${encodeURIComponent(next)}`)}
            className="w-full"
          >
            이메일 인증으로 로그인
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <CenterSpinner label="자동 로그인 중…" />
    </div>
  );
}

export default function MagicLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <CenterSpinner label="로딩 중" />
        </div>
      }
    >
      <MagicLoginHandler />
    </Suspense>
  );
}
