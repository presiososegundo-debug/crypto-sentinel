/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'neon-green': '#00ff88',
        'neon-red': '#ff3366',
        'neon-yellow': '#ffcc00',
        'dark-bg': '#0a0e1a',
        'dark-card': '#111827',
        'dark-border': '#1f2937',
      },
    },
  },
  plugins: [],
}

