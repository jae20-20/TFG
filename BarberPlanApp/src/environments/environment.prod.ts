// Entorno de producción: sustituye a environment.ts en `ng build` (fileReplacements de angular.json).
// Rellena los valores entre corchetes antes de desplegar.

export const environment = {
  production: true,
  // URL pública de la API desplegada (con https)
  apiUrl: 'https://[URL-DE-LA-API]',
  // Datos de contacto que muestra la política de privacidad
  privacidad: {
    responsable: '[NOMBRE Y APELLIDOS DEL RESPONSABLE]',
    correoContacto: '[CORREO DE CONTACTO]'
  }
};
