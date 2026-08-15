/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        slate: {
          950: '#0f172a'
        }
      },
      boxShadow: {
        neon: '0 0 24px rgba(6, 182, 212, 0.28)'
      },
      backdropBlur: {
        glass: '20px'
      }
    }
  },
  plugins: []
};
