/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'aiom-bg': '#1e1e2e',
        'aiom-sidebar': '#181825',
        'aiom-accent': '#cba6f7',
        'aiom-text': '#cdd6f4',
      }
    },
  },
  plugins: [],
}
