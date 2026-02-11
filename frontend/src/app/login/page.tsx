'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const { login } = useAuth();
  const router = useRouter();

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
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="w-full max-w-md">
        <div className="card">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              영양성분 표기사항 관리
            </h1>
            <p className="text-gray-500 text-sm">
              이메일 인증으로 로그인하세요
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {message && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
              {message}
            </div>
          )}

          {step === 'email' ? (
            <form onSubmit={handleSendCode}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  이메일
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@company.com"
                  className="input-field"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading || !email}
                className="btn-primary w-full"
              >
                {loading ? '발송 중...' : '인증 코드 받기'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode}>
              <div className="mb-2">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">{email}</span>으로 발송된 인증 코드를 입력해주세요.
                </p>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  인증 코드
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="6자리 인증 코드"
                  className="input-field text-center text-2xl tracking-widest"
                  maxLength={6}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="btn-primary w-full mb-3"
              >
                {loading ? '확인 중...' : '로그인'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setCode('');
                  setMessage('');
                }}
                className="btn-secondary w-full"
              >
                다른 이메일로 시도
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
