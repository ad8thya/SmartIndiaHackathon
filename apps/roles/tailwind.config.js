/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // palette lifted from the Urban Twin Mobile design export
        paper: '#EFEFEC',
        surface: '#FFFFFF',
        surface2: '#F7F7F5',
        ink: '#1A1A18',
        muted: '#A9A8A1',
        line: '#E4E3DE',
        accent: { DEFAULT: '#6D46C8', dark: '#5A38A8' },
        link: '#2563EB',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'system-ui',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
