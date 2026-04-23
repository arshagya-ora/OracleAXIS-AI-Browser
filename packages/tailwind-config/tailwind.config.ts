import type { Config } from 'tailwindcss/types/config';

export default {
  theme: {
    extend: {
      colors: {
        'oracle-red': '#C74634',
        'oracle-red-dark': '#9E3929',
        'oracle-red-light': '#E5654F',
        canvas: '#F8F7F3',
        ebony: '#2D2B29',
        'ebony-light': '#3A3836',
        'ebony-muted': '#4A4644',
        'warm-border': '#E0DDD5',
        'warm-gray': '#C4BFBA',
        'warm-text': '#6B6460',
      },
      fontFamily: {
        oracle: ['"Oracle Sans"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
      },
    },
  },
  plugins: [],
} as Omit<Config, 'content'>;
