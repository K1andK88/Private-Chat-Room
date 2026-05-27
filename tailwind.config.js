/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
        surface: 'var(--c-bg)',
        'surface-2': 'var(--c-bg-2)',
        'surface-3': 'var(--c-bg-3)',
        'surface-hover': 'var(--c-bg-hover)',
        bdr: 'var(--c-border)',
        txt: 'var(--c-text)',
        'txt-2': 'var(--c-text-2)',
        'txt-3': 'var(--c-text-3)',
        'txt-4': 'var(--c-text-4)',
      },
    },
  },
  plugins: [],
}
