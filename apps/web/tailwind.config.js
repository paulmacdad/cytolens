/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', '"Segoe UI"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      colors: {
        accent: {
          50: '#e6f7f9',
          100: '#b3e8ee',
          200: '#80d9e3',
          300: '#4dc9d7',
          400: '#26b8cb',
          500: '#0ea5b8',
          600: '#0b8fa0',
          700: '#077888',
          800: '#046070',
          900: '#024958',
        },
      },
    },
  },
  plugins: [],
};
