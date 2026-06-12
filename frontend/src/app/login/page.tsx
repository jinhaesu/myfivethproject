'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { Button, Input, Field, Card, CenterSpinner } from '@/components/ui';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.auth.sendCode(email);
      setStep('code');
      setMessage('인증 코드가 이메일로 발송되었습니다.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.auth.verifyCode(email, code);
      login(data.token, data.user);
      // 이메일 딥링크(?next=/launches/...)로 진입한 경우 해당 화면으로 복귀
      const next = searchParams.get('next');
      const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
      router.push(dest);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* 브랜드 헤더 */}
        <div className="flex items-center gap-2 mb-6 justify-center">
          <span className="inline-block w-1.5 h-6 rounded-sm bg-[var(--brand-500)]" />
          <span className="text-[12px] uppercase tracking-[0.16em] text-[var(--text-3)] font-semibold">
            Launch &amp; Compliance Console
          </span>
        </div>

        <Card tone="elevated" padding="lg">
          <div className="text-center mb-6">
            <h1 className="text-[22px] font-semibold tracking-tight text-[var(--text-1)] mb-1.5">
              제품 출시 관리 및 표기사항 검수
            </h1>
            <p className="text-[12.5px] text-[var(--text-3)]">이메일 인증으로 로그인하세요.</p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-md text-[12.5px] bg-[var(--danger-bg)] border border-[var(--danger-border)] text-[var(--danger-fg)]">
              {error}
            </div>
          )}

          {message && (
            <div className="mb-4 p-3 rounded-md text-[12.5px] bg-[var(--info-bg)] border border-[var(--info-border)] text-[var(--info-fg)]">
              {message}
            </div>
          )}

          {step === 'email' ? (
            <form onSubmit={handleSendCode} className="flex flex-col gap-4">
              <Field label="이메일" required>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@joinandjoin.com"
                  inputSize="md"
                  autoFocus
                  required
                />
              </Field>
              <Button type="submit" loading={loading} disabled={!email} className="w-full">
                {loading ? '발송 중…' : '인증 코드 받기'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="flex flex-col gap-4">
              <p className="text-[12.5px] text-[var(--text-3)]">
                <span className="text-[var(--text-1)] font-medium">{email}</span>으로 발송된 인증 코드를 입력하세요.
              </p>
              <Field label="인증 코드" required>
                <Input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="6자리 코드"
                  inputSize="lg"
                  className="text-center text-2xl tracking-[0.4em] tabular"
                  maxLength={6}
                  autoFocus
                  required
                />
              </Field>
              <div className="flex flex-col gap-2">
                <Button type="submit" loading={loading} disabled={code.length !== 6} className="w-full">
                  {loading ? '확인 중…' : '로그인'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setStep('email');
                    setCode('');
                    setMessage('');
                  }}
                  className="w-full"
                >
                  다른 이메일로 시도
                </Button>
              </div>
            </form>
          )}
        </Card>

        <p className="text-center text-[11px] text-[var(--text-4)] mt-6">
          © 조인앤조인 · 제품 출시 관리 및 표기사항 검수 시스템
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <CenterSpinner label="로딩 중" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
