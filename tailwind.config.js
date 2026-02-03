/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./engine/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // AMOLED black theme
        background: '#000000',
        surface: '#121212',
        surfaceVariant: '#1E1E1E',
        accent: {
          DEFAULT: '#96ACB7',
          dark: '#303030',
        },
        text: {
          primary: '#FFFFFF',
          secondary: '#B3B3B3',
          muted: '#666666',
        },
        border: '#303030',
        error: '#CF6679',
        success: '#4CAF50',
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
};
