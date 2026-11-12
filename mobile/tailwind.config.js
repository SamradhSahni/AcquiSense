/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: '#07090E',
        surface: '#0E131F',
        surfaceLight: '#182032',
        border: 'rgba(255, 255, 255, 0.08)',
        primary: '#3B82F6',
        primaryDark: '#1D4ED8',
        accentCyan: '#06B6D4',
        accentEmerald: '#10B981',
        accentAmber: '#F59E0B',
        accentRose: '#F43F5E',
      },
    },
  },
  plugins: [],
};

