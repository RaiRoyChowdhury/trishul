/** Design tokens from the TRISHUL brand brief. Change a colour here and it changes everywhere. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        crimson: { DEFAULT: '#711B27', dark: '#5A131E', light: '#8A2434' },
        vermilion: '#B83A32',
        gold: { DEFAULT: '#C9A45C', light: '#E3C98F' },
        ivory: '#F5EBDD',
        charcoal: '#292323',
        champagne: '#F0E2D0',
        ok: '#2F6B4F',
      },
      fontFamily: {
        display: ['"Playfair Display"', '"Noto Sans Bengali"', 'serif'],
        sans: ['Inter', '"Noto Sans Bengali"', '"Hind Siliguri"', 'system-ui', 'sans-serif'],
        bn: ['"Noto Sans Bengali"', '"Hind Siliguri"', 'Inter', 'sans-serif'],
      },
      boxShadow: { card: '0 1px 2px rgba(113,27,39,0.06), 0 8px 24px -8px rgba(113,27,39,0.14)', lift: '0 2px 4px rgba(113,27,39,0.08), 0 16px 32px -10px rgba(113,27,39,0.28)', glow: '0 0 0 4px rgba(201,164,92,0.35), 0 12px 30px -6px rgba(113,27,39,0.55)' },
      keyframes: {
        fadeUp: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'none' } },
        ringPulse: { '0%': { boxShadow: '0 0 0 0 rgba(201,164,92,0.55)' }, '100%': { boxShadow: '0 0 0 18px rgba(201,164,92,0)' } },
        popIn: { '0%': { opacity: '0', transform: 'scale(0.92)' }, '100%': { opacity: '1', transform: 'none' } },
      },
      animation: { 'fade-up': 'fadeUp .35s ease-out both', 'ring-pulse': 'ringPulse 1.8s ease-out infinite', 'pop-in': 'popIn .25s ease-out both' },
    },
  },
  plugins: [],
};
