// Validaciones de entrada compartidas por rutas y controladores

export const esObjectIdValido = (valor) => typeof valor === "string" && /^[a-f\d]{24}$/i.test(valor);

// Para router.param: rechaza IDs mal formados antes de que new ObjectId() lance un 500
export const validarObjectIdParam = (req, res, next, valor) => {
    if (!esObjectIdValido(valor)) {
        return res.status(400).json({ error: "Identificador no válido" });
    }
    next();
};

// ==================== CREDENCIALES ====================
// Copia en la app: BarberPlanApp/src/app/services/validacion-credenciales.util.ts.
// Los valores y mensajes deben coincidir; la batería de integración lo comprueba.

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
    pwSinLetra: "La contraseña debe incluir al menos una letra",
    pwSinNumero: "La contraseña debe incluir al menos un número",
    pwLarga: `La contraseña es demasiado larga (máximo ${PW_MAX_BYTES} caracteres; las letras con tilde y los emojis cuentan más)`,
    pwIgualActual: "La nueva contraseña debe ser distinta de la actual",
    correoFormato: "El correo electrónico no tiene un formato válido",
    correoLargo: "El correo electrónico es demasiado largo"
};

// Política de contraseñas nuevas (registro y cambio). Devuelve el mensaje de la regla incumplida o null.
// El login no la aplica, para que las cuentas con contraseñas antiguas puedan seguir entrando.
export const validarPasswordNueva = (pw) => {
    if (typeof pw !== "string" || [...pw].length < PW_MIN_CARACTERES) return MENSAJES_CREDENCIALES.pwCorta;
    if (Buffer.byteLength(pw, "utf8") > PW_MAX_BYTES) return MENSAJES_CREDENCIALES.pwLarga;
    if (!RE_LETRA.test(pw)) return MENSAJES_CREDENCIALES.pwSinLetra;
    if (!RE_DIGITO.test(pw)) return MENSAJES_CREDENCIALES.pwSinNumero;
    return null;
};

// Formato del correo ya normalizado (normalizarCorreo). Devuelve el mensaje de la regla incumplida o null.
export const validarCorreo = (correo) => {
    if (typeof correo !== "string") return MENSAJES_CREDENCIALES.correoFormato;
    if (correo.length > CORREO_MAX_CARACTERES) return MENSAJES_CREDENCIALES.correoLargo;
    if (!RE_CORREO.test(correo)) return MENSAJES_CREDENCIALES.correoFormato;
    if (correo.split("@")[0].length > CORREO_LOCAL_MAX_CARACTERES) return MENSAJES_CREDENCIALES.correoLargo;
    return null;
};

// ==================== DATOS PERSONALES ====================
// Perfil propio (PUT /usuarios/perfil) y datos personales del barbero (PUT /barberos/:id).

// Campos de texto de la persona; nombre y apellido no pueden quedar vacíos (los demás sí, para borrarlos)
export const CAMPOS_TEXTO_PERSONA = ["nombre", "apellido", "telefono", "avatar"];
const CAMPOS_TEXTO_OBLIGATORIOS = ["nombre", "apellido"];

// Un cuerpo ausente (petición sin JSON), un array o un valor suelto no son un objeto con campos
export const errorCuerpoNoObjeto = (body) =>
    body && typeof body === "object" && !Array.isArray(body) ? null : "El cuerpo de la petición debe ser un objeto JSON";

// Solo cadenas: rechaza números, booleanos, null, arrays y objetos (también los que llevan operadores de Mongo).
// Devuelve el mensaje del primer campo incorrecto o null
export const errorCamposTexto = (body, campos) => {
    const noTexto = campos.find((campo) => body[campo] !== undefined && typeof body[campo] !== "string");
    if (noTexto) return `El campo ${noTexto} debe ser texto`;

    const vacio = campos.find((campo) => CAMPOS_TEXTO_OBLIGATORIOS.includes(campo) && body[campo] !== undefined && body[campo].trim() === "");
    return vacio ? `El campo ${vacio} no puede estar vacío` : null;
};

// Respuesta 409 de cada campo con índice único en Usuarios; la comprobación previa y el error 11000 dan el mismo mensaje
export const MENSAJES_DUPLICADO = {
    correo: "El correo ya está registrado",
    usuario: "El nombre de usuario ya está en uso"
};
