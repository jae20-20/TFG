// Registro de errores sin volcar objetos completos: los errores del driver de Mongo arrastran el filtro, el documento y
// hasta la cadena de conexión, y un mensaje como «E11000 duplicate key … dup key: { correo: "x@y.com" }» contiene datos
// personales. Aquí solo sale una línea con el contexto, el tipo, el código y el mensaje recortado y sin datos.
import { config } from "../config.js";

const LONGITUD_MAXIMA_MENSAJE = 300;
const LINEAS_DE_PILA_EN_DESARROLLO = 4;

// Lo que puede llevar datos: documentos y filtros ({ … }), correos, tokens JWT y cadenas de conexión
const REDACCIONES = [
    [/mongodb(?:\+srv)?:\/\/\S+/gi, "[uri]"],
    [/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[token]"],
    [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[correo]"]
];

const sinLlaves = (texto) => {
    let anterior;
    let actual = texto;
    // Se repite para vaciar también las llaves anidadas
    do {
        anterior = actual;
        actual = actual.replace(/\{[^{}]*\}/g, "{…}");
    } while (actual !== anterior);
    return actual;
};

// Mensaje del error en una línea, recortado y sin datos
export const mensajeSeguro = (error) => {
    const bruto = typeof error === "string" ? error : error?.message ?? "";
    const redactado = REDACCIONES.reduce((texto, [patron, sustituto]) => texto.replace(patron, sustituto), sinLlaves(String(bruto)));
    return redactado.replace(/\s+/g, " ").trim().slice(0, LONGITUD_MAXIMA_MENSAJE);
};

// Línea de registro: «contexto | Tipo code=… | mensaje». En desarrollo añade las primeras líneas de la pila
export const describirError = (contexto, error) => {
    const tipo = error?.name ?? typeof error;
    const codigo = error?.code ?? error?.codeName;
    const linea = `${contexto} | ${tipo}${codigo !== undefined ? ` code=${codigo}` : ""} | ${mensajeSeguro(error)}`;
    if (config.esProduccion || typeof error?.stack !== "string") return linea;
    const pila = error.stack.split("\n").slice(1, 1 + LINEAS_DE_PILA_EN_DESARROLLO).map((l) => mensajeSeguro(l)).join("\n  ");
    return pila ? `${linea}\n  ${pila}` : linea;
};

export const registrarError = (contexto, error) => {
    console.error(describirError(String(contexto).replace(/:\s*$/, ""), error));
};
