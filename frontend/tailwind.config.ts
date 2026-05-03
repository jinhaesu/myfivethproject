import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bg-canvas)',
        surface: {
          0: 'var(--bg-0)',
          1: 'var(--bg-1)',
          2: 'var(--bg-2)',
          3: 'var(--bg-3)',
        },
        ink: {
          1: 'var(--text-1)',
          2: 'var(--text-2)',
          3: 'var(--text-3)',
          4: 'var(--text-4)',
        },
        line: {
          1: 'var(--border-1)',
          2: 'var(--border-2)',
          3: 'var(--border-3)',
        },
        brand: {
          50: 'var(--brand-50)',
          200: 'var(--brand-200)',
          400: 'var(--brand-400)',
          500: 'var(--brand-500)',
          600: 'var(--brand-600)',
          700: 'var(--brand-700)',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
      },
      boxShadow: {
        'elev-1': '0 1px 0 rgba(255,255,255,0.02), 0 1px 2px rgba(0,0,0,0.40)',
        'elev-2': '0 1px 0 rgba(255,255,255,0.03), 0 4px 8px -2px rgba(0,0,0,0.45), 0 2px 4px rgba(0,0,0,0.30)',
        'elev-3': '0 1px 0 rgba(255,255,255,0.04), 0 12px 24px -6px rgba(0,0,0,0.55), 0 4px 8px rgba(0,0,0,0.30)',
        'elev-pop': '0 24px 48px -12px rgba(0,0,0,0.65), 0 8px 16px -4px rgba(0,0,0,0.45)',
      },
      transitionTimingFunction: {
        'out-soft': 'cubic-bezier(0.22, 1, 0.36, 1)',
        spring: 'cubic-bezier(0.34, 1.4, 0.5, 1)',
        'in-out-soft': 'cubic-bezier(0.65, 0, 0.35, 1)',
      },
      transitionDuration: {
        instant: '80ms',
        fast: '140ms',
        base: '200ms',
        slow: '320ms',
      },
    },
  },
  plugins: [],
};
export default config;
