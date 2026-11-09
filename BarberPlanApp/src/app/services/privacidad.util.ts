// Política de privacidad: datos que no dependen del entorno y que el servidor también conoce.
// POLITICA_VERSION debe coincidir con la de BarberPlanAPI/src/config.js (lo comprueba la batería de integración):
// es la versión del texto que el servidor guarda junto a la fecha en que cada usuario la aceptó.

export const POLITICA_VERSION = '2026-11-09';

// Fecha de la última actualización del texto, tal como se muestra en la política
export const POLITICA_FECHA = '9 de noviembre de 2026';

export const EDAD_MINIMA = 14;

// Mismo texto que devuelve el servidor cuando falta el consentimiento (lo comprueba la batería de integración)
export const MENSAJE_SIN_CONSENTIMIENTO = 'Debes aceptar la política de privacidad para registrarte';
