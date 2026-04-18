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
          50: '#fffbf3',
          100: '#fef3df',
          200: '#fbe1bb',
          300: '#f6cc91',
          400: '#efb169',
          500: '#e29445',
          600: '#c8742f',
          700: '#a95a25',
          800: '#84471f',
          900: '#643818',
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