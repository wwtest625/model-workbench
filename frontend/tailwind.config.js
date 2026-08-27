/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Sarasa Term SC Nerd"', '"Sarasa Term SC"', '"Sarasa Mono SC"', '"Sarasa Gothic SC"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"Sarasa Term SC Nerd"', '"Sarasa Term SC"', '"Sarasa Mono SC"', '"Sarasa Gothic SC"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      colors: {
        brand: { 50: '#eef2ff', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca' }
      }
    },
  },
  plugins: [],
}
