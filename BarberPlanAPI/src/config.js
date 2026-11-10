// Configuración del servidor: todo sale de variables de entorno (ver .env.example).
// Este módulo solo lee y normaliza valores; validarEntorno() es quien decide si faltan y se llama al arrancar.
import dotenv from "dotenv";

dotenv.config();

const env = process.env;

// Entero positivo de una variable; si no está definida o no es válida, el valor por defecto
const entero = (valor, porDefecto) => {
    const numero = Number(valor);
    return Number.isInteger(numero) && numero > 0 ? numero : porDefecto;
};

// TRUST_PROXY: nº de proxies de confianza ("1"), "true"/"false" o una lista de subredes de Express
const leerTrustProxy = (valor) => {
    if (valor === undefined || valor.trim() === "") return false;
    const texto = valor.trim();
    if (texto === "true") return true;
    if (texto === "false") return false;
    return /^\d+$/.test(texto) ? Number(texto) : texto;
};

// Orígenes permitidos: navegador en desarrollo (ng serve / ionic serve) y
// WebViews de Capacitor (Android: http://localhost, iOS: capacitor://localhost).
const CORS_POR_DEFECTO = [
    "http://localhost:4200",
    "http://localhost:8100",
    "http://localhost",
    "capacitor://localhost",
    "ionic://localhost"
];
const origenesCors = env.CORS_ORIGINS
    ? env.CORS_ORIGINS.split(",").map((origen) => origen.trim()).filter(Boolean)
    : CORS_POR_DEFECTO;

// Base de datos que se usa en desarrollo si DB_NAME no está definida; en producción es un error usarla
const NOMBRE_BD_DESARROLLO = "BarberPlan";

// Versión del texto de la política de privacidad que se acepta al registrarse.
// Debe coincidir con BarberPlanApp/src/app/services/privacidad.util.ts (lo comprueba la batería de integración)
export const POLITICA_VERSION = "2026-11-09";

export const config = {
    entorno: env.NODE_ENV || "development",
    esProduccion: env.NODE_ENV === "production",
    puerto: env.PORT || 5050,
    atlasUri: env.ATLAS_URI,
    nombreBD: env.DB_NAME || NOMBRE_BD_DESARROLLO,
    nombreBDDefinido: Boolean(env.DB_NAME),
    jwtSecret: env.JWT_SECRET,
    jwtExpiracion: "24h",
    bcryptRondas: 10,
    origenesCors,
    corsDefinidoPorEntorno: Boolean(env.CORS_ORIGINS),
    trustProxy: leerTrustProxy(env.TRUST_PROXY),
    trustProxyDefinido: Boolean(env.TRUST_PROXY && env.TRUST_PROXY.trim() !== ""),
    // Límite global por IP (RATE_LIMIT_MAX se sube en las pruebas, que lanzan cientos de peticiones desde una IP)
    limiteGlobal: entero(env.RATE_LIMIT_MAX, 100),
    // Login y registros (cliente, barbero y barbería): intentos cada 15 min por IP
    limiteAutenticacion: entero(env.AUTH_RATE_LIMIT_MAX, 10),
    // Validación de códigos de invitación: intentos cada 15 min por IP
    limiteInvitaciones: entero(env.INVITATION_RATE_LIMIT_MAX, 15),
    // Tiempos de Mongo: pasado este plazo sin respuesta la API contesta 503 en lugar de quedarse esperando
    // (el driver tarda 30 s en rendirse al elegir servidor y no pone límite a una operación ya enviada)
    mongoSeleccionMs: entero(env.MONGO_SERVER_SELECTION_TIMEOUT_MS, 10000),
    mongoSocketMs: entero(env.MONGO_SOCKET_TIMEOUT_MS, 30000),
    // TAREAS_CITAS=off arranca sin tareas periódicas (pruebas que no deben escribir en la BD)
    tareasCitas: env.TAREAS_CITAS !== "off"
};

const JWT_MIN_CARACTERES = 32;

// Comprueba la configuración antes de abrir el puerto. En producción son obligatorias la clave del JWT (y suficientemente
// larga), la cadena de Mongo, el nombre de la base (que no puede ser la de desarrollo), los orígenes CORS y TRUST_PROXY
// (0 si no hay proxy); en desarrollo basta con la cadena de Mongo.
export const validarEntorno = () => {
    const errores = [];
    if (!config.atlasUri) errores.push("ATLAS_URI (cadena de conexión de MongoDB)");

    if (config.esProduccion) {
        if (!config.jwtSecret) {
            errores.push("JWT_SECRET (clave para firmar los tokens)");
        } else if (config.jwtSecret.length < JWT_MIN_CARACTERES) {
            errores.push(`JWT_SECRET demasiado corta (mínimo ${JWT_MIN_CARACTERES} caracteres)`);
        }
        if (!config.corsDefinidoPorEntorno) errores.push("CORS_ORIGINS (orígenes permitidos, separados por comas)");
        if (!config.nombreBDDefinido) {
            errores.push("DB_NAME (nombre de la base de datos de producción)");
        } else if (config.nombreBD === NOMBRE_BD_DESARROLLO) {
            errores.push(`DB_NAME no puede ser «${NOMBRE_BD_DESARROLLO}» en producción: es la base de desarrollo`);
        }
        // Sin esto, detrás del proxy del hosting todos los usuarios compartirían IP y el límite de peticiones
        if (!config.trustProxyDefinido) errores.push("TRUST_PROXY (nº de proxies de confianza; 1 en Render, 0 si no hay proxy)");
    } else if (!config.jwtSecret) {
        console.warn("Aviso: JWT_SECRET no está definida; el inicio de sesión fallará hasta que la configures");
    }

    if (errores.length > 0) {
        throw new Error(`Configuración incompleta o no válida. Revisa las variables de entorno:\n  - ${errores.join("\n  - ")}`);
    }
};
