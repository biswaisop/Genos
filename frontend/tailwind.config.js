/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          yellow: '#FACC15',
          'yellow-dim': '#CA8A04',
          'yellow-muted': '#78450A',
          black: '#000000',
          'black-soft': '#0A0A0A',
          'black-card': '#111111',
          'black-raised': '#1A1A1A',
          border: '#222222',
          'border-yellow': 'rgba(250,204,21,0.35)',
          white: '#FFFFFF',
          'white-dim': '#A3A3A3',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'yellow-glow': '0 0 24px -4px rgba(250,204,21,0.25)',
        'yellow-glow-lg': '0 0 40px -8px rgba(250,204,21,0.3)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease both',
        shimmer: 'shimmer 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
