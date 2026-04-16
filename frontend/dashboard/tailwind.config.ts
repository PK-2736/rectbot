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
          50: '#f9f5f1',
          100: '#f2e8de',
          200: '#e7d2bf',
          300: '#d7b395',
          400: '#c79170',
          500: '#b87755',
          600: '#9f6347',
          700: '#83513c',
          800: '#6d4435',
          900: '#5b3a2f',
        },
        accent: {
          50: '#f2f7f6',
          100: '#e3efec',
          200: '#c7ded9',
          300: '#a4c9c1',
          400: '#7fb2a7',
          500: '#5f988b',
          600: '#4a7f74',
          700: '#3e685f',
          800: '#36564f',
          900: '#314942',
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