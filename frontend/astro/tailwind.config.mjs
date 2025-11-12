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
        // Brand warm palette (orange + pink blend)
        brand: {
          50: '#fff9f5',
          100: '#fff2ea',
          200: '#ffdcca',
          300: '#ffc0a1',
          400: '#ff9d6f',
          500: '#ff7e42', // primary base
          600: '#f45f1d',
          700: '#d54a11',
          800: '#a83813',
          900: '#7f2c12',
        },
        accent: {
          50: '#fff5f8',
          100: '#ffe6ef',
            200: '#ffc9de',
          300: '#ffa3c7',
          400: '#ff73ab',
          500: '#ff3d8a', // accent base
          600: '#e51974',
          700: '#c10e60',
          800: '#930a49',
          900: '#6d0736',
        }
      },
    },
  },
  plugins: [],
}