'use client';

// 통합 SSO: 로그인 페이지에 오면 자동으로 허브(auth.nuldam.com)로 포워딩 → 구글 로그인 → /sso 복귀.
// 기존 이메일 OTP 폼은 제거(백엔드 OTP 엔드포인트는 복구용으로 유지).
import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { CenterSpinner } from '@/components/ui';

const HUB_AUTHORIZE = 'https://auth.nuldam.com/authorize';
const APP_KEY = 'pmanage';
const SSO_RETURN = 'https://pmanage.nuldam.com/sso';

function Redirector() {
  const searchParams = useSearchParams();
  useEffect(() => {
    const next = searchParams.get('next');
    const ret =
      next && next.startsWith('/') && !next.startsWith('//')
        ? `${SSO_RETURN}?next=${encodeURIComponent(next)}`
        : SSO_RETURN;
    window.location.href = `${HUB_AUTHORIZE}?app=${APP_KEY}&return=${encodeURIComponent(ret)}`;
  }, [searchParams]);

  return <CenterSpinner label="회사 계정 로그인으로 이동 중..." />;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<CenterSpinner />}>
      <Redirector />
    </Suspense>
  );
}
