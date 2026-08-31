/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0e14',
        panel: '#111826',
        panel2: '#161f2e',
        border: '#22304a',
        up: '#22d3a5',
        down: '#f5495c',
        accent: '#7c5cff',
        accent2: '#38bdf8',
      },
      boxShadow: {
        glow: '0 0 24px rgba(124,92,255,0.35)',
      },
    },
  },
  plugins: [],
};
