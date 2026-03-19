/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // MyAppLabs brand palette
        navy: {
          DEFAULT: '#0B1F3A',   // primary background / text
          50:  '#e8edf3',
          100: '#c5d1de',
          200: '#9eb2c7',
          300: '#7793b0',
          400: '#587da0',
          500: '#3a678f',
          600: '#2f5478',
          700: '#22405f',
          800: '#152c47',
          900: '#0B1F3A',
        },
        brand: {
          DEFAULT: '#E8622A',   // primary accent / CTA
          50:  '#fdf0e9',
          100: '#fad7c3',
          200: '#f6bc9a',
          300: '#f2a171',
          400: '#ef8b51',
          500: '#E8622A',
          600: '#d0541f',
          700: '#b04416',
          800: '#8f360e',
          900: '#6e2808',
        },
      },
      fontFamily: {
        sans: [
          'Inter', 'ui-sans-serif', 'system-ui', '-apple-system',
          'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue',
          'Arial', 'sans-serif',
        ],
      },
      borderRadius: {
        xl:  '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        card: '0 2px 8px rgba(11,31,58,0.08), 0 1px 2px rgba(11,31,58,0.05)',
        'card-hover': '0 6px 24px rgba(11,31,58,0.12), 0 2px 6px rgba(11,31,58,0.08)',
        modal: '0 24px 60px rgba(11,31,58,0.25)',
      },
    },
  },
  plugins: [],
}
