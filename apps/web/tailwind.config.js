/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // dark operator palette (command console + field app)
        ink: {
          // roles-portal light theme uses bare `text-ink` / `bg-ink`
          DEFAULT: '#1A1A18',
          900: '#080b14',
          800: '#0d1220',
          700: '#141b2e',
          600: '#1d2740',
          500: '#2a3654',
        },
        edge: '#243050',
        detected: '#94a3b8',
        working: '#f59e0b',
        critical: '#ef4444',
        done: '#22c55e',
        // light citizen/roles palette
        paper: '#EFEFEC',
        surface: '#FFFFFF',
        surface2: '#F7F7F5',
        muted: '#A9A8A1',
        line: '#E4E3DE',
        accent: { DEFAULT: '#6D46C8', dark: '#5A38A8' },
        link: '#2563EB',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 240ms ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0', transform: 'translateY(4px)' }, '100%': { opacity: '1', transform: 'none' } },
      },
    },
  },
  plugins: [],
};
