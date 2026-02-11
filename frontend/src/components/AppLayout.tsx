'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-gray-500">로딩 중...</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14 items-center">
            <div className="flex items-center gap-8">
              <Link href="/dashboard" className="text-lg font-bold text-blue-600">
                표기사항 관리
              </Link>
              <div className="hidden sm:flex gap-4">
                <Link
                  href="/dashboard"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  대시보드
                </Link>
                <Link
                  href="/labels/new"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  새 라벨 작성
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">
                {user.name || user.email}
                {user.department && ` (${user.department})`}
              </span>
              <button
                onClick={() => {
                  logout();
                  router.push('/login');
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}
