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
          400: 'var(--custom-gold-light, #f5d47a)',
          500: 'var(--custom-gold, #d4af37)',
          600: 'var(--custom-gold-dark, #b88f1f)',
          700: '#a8821a',
        },
        dark: {
          900: 'var(--ion-background-color, #121212)',
          800: 'var(--custom-surface, #1E1E1E)',
          700: 'var(--custom-border-subtle, #2C2C2E)',
          600: 'var(--custom-text-muted, #8E8E93)',
        },
        dynamic: {
          text: 'var(--custom-text-primary, #ffffff)',
          muted: 'var(--custom-text-muted, #9ca3af)',
          bg: 'var(--ion-background-color, #121212)',
          surface: 'var(--custom-surface, #1e1e1e)',
          border: 'var(--custom-border-subtle, #374151)'
        }
      },
      backgroundColor: {
        'gradient-dark': 'linear-gradient(135deg, var(--ion-background-color, #121212) 0%, var(--custom-card-bg, #1E1E1E) 100%)',
      },
    },
  },
  plugins: [],
}
