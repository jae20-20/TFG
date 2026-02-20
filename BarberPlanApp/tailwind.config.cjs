module.exports = {
  content: [
    "./src/**/*.{html,ts,scss}",
    "./src/app/**/*.{html,ts,scss}"
  ],
  // Desactivar preflight para evitar conflictos con los estilos base de Ionic
  corePlugins: { preflight: false },
  theme: {
    extend: {},
  },
  plugins: [],
}
