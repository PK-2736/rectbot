/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        'inter': ['Inter', 'system-ui', 'sans-serif'],
        'sans': ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        slate: {
          950: '#0f172a',
        },
        brand: {
          50: '#fffaf6',
          100: '#fff2e9',
          200: '#f8decb',
          300: '#efc19c',
          400: '#e5a878',
          500: '#d9894f',
          600: '#c9733d',
          700: '#ac5e34',
          800: '#8b4c2e',
          900: '#6f3d27',
        },
        accent: {
          50: '#fff6f2',
          100: '#ffe9df',
          200: '#f8cfbb',
          300: '#efab87',
          400: '#e28a63',
          500: '#cf6f4d',
          600: '#b95c41',
          700: '#974834',
          800: '#7a3b2d',
          900: '#633128',
        }
      },
    },
  },
  plugins: [],
}