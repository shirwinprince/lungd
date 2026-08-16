/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: '#05070a',
          card: 'rgba(13, 17, 23, 0.85)',
          border: 'rgba(6, 182, 212, 0.22)',
          borderHover: 'rgba(217, 70, 239, 0.45)',
          cyan: '#06b6d4',
          cyanLight: '#38bdf8',
          purple: '#a855f7',
          purpleLight: '#c084fc',
          green: '#10b981',
          orange: '#f97316',
          red: '#ef4444',
        }
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
