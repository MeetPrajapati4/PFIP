/** @type {import('tailwindcss').Config} */

// Colours are driven by CSS custom properties (see index.css) so a single
// `data-theme` swap on <html> restyles the whole app without a re-render.
// `<alpha-value>` keeps Tailwind's /opacity modifiers working through the var.
const withOpacity = (variable) => `rgb(var(${variable}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Surfaces, from furthest back to closest to the reader
        canvas: withOpacity('--c-canvas'),
        surface: withOpacity('--c-surface'),
        raised: withOpacity('--c-raised'),
        overlay: withOpacity('--c-overlay'),
        hairline: withOpacity('--c-hairline'),

        // Text
        strong: withOpacity('--c-text-strong'),
        body: withOpacity('--c-text-body'),
        muted: withOpacity('--c-text-muted'),
        faint: withOpacity('--c-text-faint'),

        // Brand + semantics
        brand: {
          DEFAULT: withOpacity('--c-brand'),
          soft: withOpacity('--c-brand-soft'),
          strong: withOpacity('--c-brand-strong'),
          contrast: withOpacity('--c-brand-contrast'),
        },
        positive: withOpacity('--c-positive'),
        negative: withOpacity('--c-negative'),
        warning: withOpacity('--c-warning'),
        info: withOpacity('--c-info'),
        violet: withOpacity('--c-violet'),
      },
      fontFamily: {
        sans: ['Inter var', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        // Layered shadows read as depth; a single blur reads as a smudge.
        xs: '0 1px 2px rgb(var(--c-shadow) / 0.06)',
        sm: '0 1px 3px rgb(var(--c-shadow) / 0.08), 0 1px 2px rgb(var(--c-shadow) / 0.04)',
        md: '0 4px 12px -2px rgb(var(--c-shadow) / 0.10), 0 2px 6px -2px rgb(var(--c-shadow) / 0.06)',
        lg: '0 12px 28px -6px rgb(var(--c-shadow) / 0.14), 0 4px 10px -4px rgb(var(--c-shadow) / 0.08)',
        xl: '0 24px 48px -12px rgb(var(--c-shadow) / 0.20), 0 8px 20px -8px rgb(var(--c-shadow) / 0.10)',
        glow: '0 0 0 1px rgb(var(--c-brand) / 0.20), 0 8px 32px -8px rgb(var(--c-brand) / 0.35)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '70%, 100%': { transform: 'scale(1.6)', opacity: '0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fade-in 0.3s ease-out both',
        'scale-in': 'scale-in 0.18s cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-up': 'slide-up 0.24s cubic-bezier(0.16, 1, 0.3, 1) both',
        shimmer: 'shimmer 1.8s infinite',
        float: 'float 8s ease-in-out infinite',
        marquee: 'marquee 34s linear infinite',
        'pulse-ring': 'pulse-ring 2.4s cubic-bezier(0.24, 0, 0.38, 1) infinite',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
