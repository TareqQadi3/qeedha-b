/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f9f6',
          100: '#d7efe6',
          500: '#0e5f58',
          600: '#0b4d47',
          700: '#083b36',
        },
        accent: {
          500: '#f5a623',
        },
      },
    },
  },
  plugins: [],
};
