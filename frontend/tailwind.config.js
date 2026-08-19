/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Native/system stack, not a webfont - no external network dependency
      // (verified during Playwright runs: a Google Fonts <link> in
      // index.html caused hard-navigation hangs under this environment's
      // proxy). Every platform's own UI font already covers Arabic well
      // (SF Arabic, Segoe UI, Noto Sans Arabic, Roboto), so this renders
      // just as modern with zero request and no offline/outage risk.
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          '"Segoe UI"',
          '"Noto Sans Arabic"',
          'Tahoma',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        // Same brand hue family as before (deep teal), rebuilt as a full,
        // evenly-stepped ramp so every step (hover, active, subtle bg,
        // border, solid fill, text-on-light) has its own token instead of
        // reusing 3 shades for everything.
        // Step 500 is used across the app for borders/focus rings/decorative
        // fills only (>=3:1 against white, WCAG 1.4.11 non-text threshold).
        // Step 600+ is used for text and white-text-on-fill buttons/badges
        // (>=4.5:1 against white, verified: #0f766e -> 5.47:1) - do not
        // lighten 600 without re-measuring both pairs.
        brand: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#0d9488',
          600: '#0f766e',
          700: '#115e59',
          800: '#134e4a',
          900: '#0f3f3b',
          950: '#042f2e',
        },
        // Warm accent for highlights/CTAs distinct from brand - same hue
        // family as the previous single accent-500, now a full ramp.
        accent: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(15, 23, 42, 0.04), 0 8px 24px -8px rgba(15, 23, 42, 0.10)',
        popover: '0 4px 6px -2px rgba(15, 23, 42, 0.06), 0 16px 40px -12px rgba(15, 23, 42, 0.18)',
      },
    },
  },
  plugins: [],
};
