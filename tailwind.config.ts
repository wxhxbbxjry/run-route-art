import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'var(--font-sans)',
          'var(--font-geist-sans)',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        display: [
          'var(--font-display)',
          'var(--font-sans)',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          'var(--font-mono)',
          'var(--font-geist-mono)',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      colors: {
        background: 'var(--bg-canvas)',
        foreground: 'var(--text-primary)',
        surface: {
          elevated: 'var(--surface-elevated)',
          subtle: 'var(--surface-subtle)',
          well: 'var(--surface-well)',
        },
        brand: {
          DEFAULT: 'var(--brand-accent)',
          hover: 'var(--brand-accent-hover)',
          press: 'var(--brand-accent-press)',
          ink: 'var(--brand-ink)',
        },
      },
    },
  },
  plugins: [],
};
export default config;
