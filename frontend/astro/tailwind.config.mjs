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
          50: '#f3f7fb',
          100: '#e8eef6',
          200: '#cfdcec',
          300: '#afc2db',
          400: '#7f9fbe',
          500: '#557ca2',
          600: '#426488',
          700: '#374f6d',
          800: '#2f425a',
          900: '#2a384d',
        },
        accent: {
          50: '#eef9f7',
          100: '#d7efe9',
          200: '#b2dfd4',
          300: '#86cbbd',
          400: '#5db4a6',
          500: '#3f988d',
          600: '#2f7c73',
          700: '#28645e',
          800: '#24514d',
          900: '#22433f',
        }
      },
    },
  },
  plugins: [],
}