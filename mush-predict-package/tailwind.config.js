/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        mk: {
          blue:   '#003A5D',
          ocean:  '#005776',
          green:  '#447D29',
          gold:   '#D7944B',
          orange: '#C15A2D',
          silver: '#B6B9BF',
          lgrey:  '#D7D8D6',
          lblue:  '#569BB4',
          lgreen: '#9ECF7C',
          maroon: '#793949',
        },
      },
      fontFamily: {
        barlow: ['Barlow', 'sans-serif'],
        body:   ['Calibri', 'system-ui', 'sans-serif'],
        mono:   ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      animation: {
        'fade-in':     'fadeIn 0.35s ease both',
        'slide-up':    'slideUp 0.4s ease both',
        'pulse-soft':  'pulseSoft 2s ease-in-out infinite',
        'progress':    'progress 1.5s ease-out both',
      },
      keyframes: {
        fadeIn:    { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } },
        slideUp:   { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'none' } },
        pulseSoft: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.55 } },
        progress:  { from: { width: '0%' }, to: {} },
      },
    },
  },
  plugins: [],
}
