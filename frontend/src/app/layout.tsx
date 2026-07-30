import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains',
});

export const metadata: Metadata = {
  title: '제품 출시 관리 및 표기사항 검수 시스템',
  description: '신제품 출시 프로세스와 표기사항 검수를 한 곳에서 관리합니다.',
};

// 모바일 대응 — 확대(pinch zoom)는 접근성을 위해 막지 않는다
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // 노치 있는 기기에서 safe-area 사용 가능하게
};

// 페인트 전에 <html data-theme>를 세팅해 다크→라이트(또는 그 반대) 깜빡임을 막는다.
// 기본값은 항상 'dark' — 시스템 설정(prefers-color-scheme)은 참고하지 않는다.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');document.documentElement.dataset.theme=(t==='light'?'light':'dark');}catch(e){document.documentElement.dataset.theme='dark';}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
