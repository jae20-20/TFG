// Entorno de desarrollo. `ng build` (producción) lo sustituye por environment.prod.ts (fileReplacements en angular.json).
// Todo valor que cambie entre desarrollo y producción va aquí, no en el código.

export const environment = {
  production: false,
  // URL base de la API (BarberPlanAPI)
  apiUrl: 'http://localhost:5050',
  // Datos de contacto que muestra la política de privacidad
  privacidad: {
    responsable: '[NOMBRE Y APELLIDOS DEL RESPONSABLE]',
    correoContacto: '[CORREO DE CONTACTO]'
  }
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
