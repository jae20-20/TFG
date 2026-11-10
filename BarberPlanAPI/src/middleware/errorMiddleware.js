// Respuestas de error comunes a toda la API, siempre con el formato { error }
import { registrarError } from "../utils/registrarError.js";

// Mensaje único para cuando la base de datos no responde: sin nombres de host, de driver ni de error de Mongo
export const MENSAJE_SERVICIO_NO_DISPONIBLE = "El servicio no está disponible en este momento. Inténtalo de nuevo en unos segundos";
// Segundos que se sugieren al cliente en la cabecera Retry-After
const REINTENTO_SEGUNDOS = 5;

// Errores del driver que significan «no hay conexión con Mongo» o «Mongo no ha contestado a tiempo»
const ERRORES_DE_CONEXION = new Set([
    "MongoNetworkError",
    "MongoNetworkTimeoutError",
    "MongoServerSelectionError",
    "MongoWaitQueueTimeoutError",
    "MongoPoolClearedError",
    "MongoPoolClosedError",
    "MongoTopologyClosedError",
    "MongoNotConnectedError",
    "MongoOperationTimeoutError"
]);

// Códigos del servidor: host inalcanzable, tiempo agotado, apagándose o sin primario
const CODIGOS_NO_DISPONIBLE = new Set([
    6,     // HostUnreachable
    7,     // HostNotFound
    50,    // MaxTimeMSExpired
    89,    // NetworkTimeout
    91,    // ShutdownInProgress
    189,   // PrimarySteppedDown
    262,   // ExceededTimeLimit
    10107, // NotWritablePrimary
    11600, // InterruptedAtShutdown
    11602, // InterruptedDueToReplStateChange
    13435, // NotPrimaryNoSecondaryOk
    13436  // NotPrimaryOrSecondary
]);

// Etiquetas de transacción: el driver reintenta un tiempo y, si no lo consigue, relanza el error con la etiqueta
const ETIQUETAS_NO_DISPONIBLE = ["TransientTransactionError", "UnknownTransactionCommitResult"];

// true si el error significa que la base de datos no está disponible (conexión caída o tiempo agotado) y conviene
// responder 503 en lugar de 500. Mira también la causa (cause) por si el driver envuelve el error
export const esErrorDeBaseDeDatosNoDisponible = (error, profundidad = 0) => {
    if (!error || typeof error !== "object" || profundidad > 3) return false;
    if (ERRORES_DE_CONEXION.has(error.name)) return true;
    if (typeof error.code === "number" && CODIGOS_NO_DISPONIBLE.has(error.code)) return true;
    if (typeof error.hasErrorLabel === "function" && ETIQUETAS_NO_DISPONIBLE.some((etiqueta) => error.hasErrorLabel(etiqueta))) return true;
    return esErrorDeBaseDeDatosNoDisponible(error.cause, profundidad + 1);
};

const responder503 = (res) => {
    res.set("Retry-After", String(REINTENTO_SEGUNDOS));
    return res.status(503).json({ error: MENSAJE_SERVICIO_NO_DISPONIBLE });
};

// Respuesta de los controladores en su catch: 503 si la base de datos no está disponible, 500 con el mensaje de la ruta
// en cualquier otro caso. Nunca devuelve detalles del error
export const responderErrorInterno = (res, error, mensaje) => {
    if (esErrorDeBaseDeDatosNoDisponible(error)) {
        return responder503(res);
    }
    return res.status(500).json({ error: mensaje });
};

// Ninguna ruta coincide con la petición
export const rutaNoEncontrada = (req, res) => {
    res.status(404).json({ error: "Ruta no encontrada" });
};

// Errores que no ha respondido ningún controlador: cuerpo mal formado o demasiado grande
// (los lanza express.json antes de llegar a las rutas) y excepciones no capturadas.
// Express lo reconoce como manejador de errores por tener cuatro parámetros (next incluido)
export const manejadorErrores = (err, req, res, next) => {
    if (err.type === "entity.parse.failed") {
        return res.status(400).json({ error: "El cuerpo de la petición no es un JSON válido" });
    }
    if (err.type === "entity.too.large") {
        return res.status(413).json({ error: "La petición es demasiado grande" });
    }
    // Otros errores de lectura del cuerpo (codificación o juego de caracteres no admitidos)
    if (err.status >= 400 && err.status < 500) {
        return res.status(err.status).json({ error: "Petición no válida" });
    }
    registrarError("Error no controlado:", err);
    // Por ejemplo, el middleware que comprueba la cuenta antes de las rutas de escritura
    if (esErrorDeBaseDeDatosNoDisponible(err)) {
        return responder503(res);
    }
    res.status(500).json({ error: "Error interno del servidor" });
};
