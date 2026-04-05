module.exports = {
  content: [
    "./src/**/*.{html,ts,scss}",
    "./src/app/**/*.{html,ts,scss}"
  ],
  // Desactivar preflight para evitar conflictos con los estilos base de Ionic
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        gold: {
          50: '#fefdf8',
          100: '#fdf9f0',
          300: '#f4d9a8',
          400: '#e8c880',
          500: '#d4af37',
          600: '#c9a227',
          700: '#a8821a',
        },
        dark: {
          900: '#0f0f0f',
          800: '#1a1a1a',
          700: '#2a2a2a',
          600: '#3a3a3a',
        },
      },
      backgroundColor: {
        'gradient-dark': 'linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%)',
      },
    },
  },
  plugins: [],
}
