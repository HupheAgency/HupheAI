/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/renderer/**/*.{html,js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        'active-yellow': '#facc15'
      }
    }
  },
  plugins: []
}
