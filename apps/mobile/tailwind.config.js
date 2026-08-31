/**
 * Tokens transcribed from the design canvas export (`Frontend1.zip` →
 * `index1.html`), not invented here. Where the design and the console disagree
 * the design wins, because this app is a rebuild of that comp — see
 * apps/mobile/README.md § Palette for the one place they differ.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── ground + text (design `body` / `.dark body`) ────────────────────
        canvas: '#F1F5F9',
        'canvas-dark': '#050B14',
        card: '#FFFFFF',
        'card-dark': '#0F1A2A',
        ink: {
          DEFAULT: '#0F172A',
          soft: '#475569',
          muted: '#64748B',
          faint: '#94A3B8',
        },
        'ink-dark': '#F8FAFC',
        line: '#E2E8F0',
        'line-dark': '#1E293B',

        // ── accents (design `C`) ────────────────────────────────────────────
        accent: '#2563EB',
        'accent-deep': '#1D4ED8',
        emerald: '#10B981',
        amber: '#D97706',
        danger: '#DC2626',
        success: '#16A34A',
        coral: '#EA580C',
        violet: '#7C3AED',
      },
      borderRadius: {
        // .ut-card / .citizen-action-card in the design
        card: '14px',
        action: '16px',
      },
      fontFamily: {
        // The design's body stack — system faces only, so there is nothing to
        // download and `make demo` still renders correctly with the wifi off.
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'Segoe UI',
          'Roboto',
          'system-ui',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      keyframes: {
        utfade: { from: { opacity: '0' }, to: { opacity: '1' } },
        utrise: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'none' },
        },
        utping: {
          '0%': { transform: 'scale(.5)', opacity: '.8' },
          '75%,100%': { transform: 'scale(2.2)', opacity: '0' },
        },
        utpulse: {
          '0%,100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '.65', transform: 'scale(1.08)' },
        },
        utslidein: {
          from: { opacity: '0', transform: 'translateX(14px)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        utfade: 'utfade .24s ease-out',
        utrise: 'utrise .28s cubic-bezier(0.16, 1, 0.3, 1)',
        utping: 'utping 1.8s infinite ease-out',
        utpulse: 'utpulse 1.8s infinite ease-in-out',
        utslidein: 'utslidein .24s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionTimingFunction: {
        // the design's one easing curve — used on every card and button
        ut: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
