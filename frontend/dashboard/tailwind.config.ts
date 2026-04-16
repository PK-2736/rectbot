import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        slate: {
          950: '#0f172a',
        },
        brand: {
          50: '#fff9f5',
          100: '#fff2ea',
          200: '#ffdcca',
          300: '#ffc0a1',
          400: '#ff9d6f',
          500: '#ff7e42',
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
          500: '#ff3d8a',
          600: '#e51974',
          700: '#c10e60',
          800: '#930a49',
          900: '#6d0736',
        },
        gray: {
          900: '#111827',
          800: '#1f2937',
          700: '#374151',
          600: '#4b5563',
          500: '#6b7280',
          400: '#9ca3af',
        },
      },
    },
  },
  plugins: [],
}
export default config