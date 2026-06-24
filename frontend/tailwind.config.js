/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './public/index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Identidad de marca MyPetLive (ver src/styles/mypetlive.tsx)
        teal: { DEFAULT: '#1F6F6F', 100: '#E2EEEC', 600: '#1F6F6F', 700: '#176363' },
        coral: { DEFAULT: '#E8654A', 100: '#FBE7E0', 600: '#E8654A', 700: '#C0512F' },
        olive: { DEFAULT: '#6A7B4F', 100: '#ECEFE2', 700: '#566A3D' },
        gold: { DEFAULT: '#E9A93C', 100: '#FBEFD4', 700: '#A77B1C' },
        ink: '#3F4A3C',
        cream: '#F6F3EC',
        panel: '#EFEADF',
        primary: '#1F6F6F',
        'primary-hover': '#176363',
        success: '#6A7B4F',
        warning: '#E9A93C',
        error: '#B91C1C',
      },
      borderRadius: {
        DEFAULT: '8px',
      },
    },
    fontFamily: {
      display: ['Bricolage Grotesque', 'sans-serif'],
      sans: ['Hanken Grotesk', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      mono: ['JetBrains Mono', 'monospace'],
    },
  },
  plugins: [],
};

