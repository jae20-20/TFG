// Reglas de correo y contraseña para avisar antes de enviar el formulario. La validación que cuenta es la del
// servidor: BarberPlanAPI/src/middleware/validateMiddleware.js. Los valores y mensajes deben coincidir;
// la batería de integración del servidor lo comprueba.

export const PW_MIN_CARACTERES = 8;
// bcrypt ignora lo que pasa de 72 bytes: se cuentan bytes UTF-8, no caracteres
export const PW_MAX_BYTES = 72;
export const CORREO_MAX_CARACTERES = 254;
export const CORREO_LOCAL_MAX_CARACTERES = 64;
export const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_LETRA = /\p{L}/u;
const RE_DIGITO = /[0-9]/;

export const MENSAJES_CREDENCIALES = {
  pwCorta: `La contraseña debe tener al menos ${PW_MIN_CARACTERES} caracteres`,
  pwSinLetra: 'La contraseña debe incluir al menos una letra',
  pwSinNumero: 'La contraseña debe incluir al menos un número',
  pwLarga: `La contraseña es demasiado larga (máximo ${PW_MAX_BYTES} caracteres; las letras con tilde y los emojis cuentan más)`,
  pwIgualActual: 'La nueva contraseña debe ser distinta de la actual',
  correoFormato: 'El correo electrónico no tiene un formato válido',
  correoLargo: 'El correo electrónico es demasiado largo',
};

// Misma regla que el servidor: igual que en el login, el correo se compara sin espacios y en minúsculas
export const normalizarCorreo = (correo: string): string => (correo ?? '').trim().toLowerCase();

// Mensaje de la regla incumplida, o null si la contraseña nueva es válida
export const validarPasswordNueva = (pw: string): string | null => {
  if (typeof pw !== 'string' || [...pw].length < PW_MIN_CARACTERES) return MENSAJES_CREDENCIALES.pwCorta;
  if (new TextEncoder().encode(pw).length > PW_MAX_BYTES) return MENSAJES_CREDENCIALES.pwLarga;
  if (!RE_LETRA.test(pw)) return MENSAJES_CREDENCIALES.pwSinLetra;
  if (!RE_DIGITO.test(pw)) return MENSAJES_CREDENCIALES.pwSinNumero;
  return null;
};

// Mensaje de la regla incumplida, o null si el correo (sin normalizar) es válido
export const validarCorreo = (correo: string): string | null => {
  const normalizado = normalizarCorreo(correo);
  if (normalizado.length > CORREO_MAX_CARACTERES) return MENSAJES_CREDENCIALES.correoLargo;
  if (!RE_CORREO.test(normalizado)) return MENSAJES_CREDENCIALES.correoFormato;
  if (normalizado.split('@')[0].length > CORREO_LOCAL_MAX_CARACTERES) return MENSAJES_CREDENCIALES.correoLargo;
  return null;
};
