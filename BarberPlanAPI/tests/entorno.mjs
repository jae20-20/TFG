// Infraestructura común de las baterías de pruebas: base de datos desechable, API propia y utilidades.
// Las baterías se ejecutan una detrás de otra (comparten BD), nunca en paralelo.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";

export const RAIZ_API = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(RAIZ_API, ".env"), quiet: true });

// Las pruebas y las medidas solo pueden crear, llenar y borrar bases de datos cuyo nombre acabe en _test. Es la barrera
// que impide tocar la base de desarrollo o la de producción aunque el .env las nombre
export const exigirBaseDePruebas = (nombre) => {
    if (typeof nombre !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]*_test$/.test(nombre)) {
        throw new Error(`Las pruebas solo pueden usar bases de datos cuyo nombre termine en _test (recibido: ${JSON.stringify(nombre)})`);
    }
    return nombre;
};

// El nombre sale de TEST_DB_NAME o es BarberPlan_test; DB_NAME del .env no se lee nunca
export const NOMBRE_BD_PRUEBAS = exigirBaseDePruebas(process.env.TEST_DB_NAME || "BarberPlan_test");

// Cadena de conexión de las pruebas: SOLO TEST_ATLAS_URI. ATLAS_URI (la de la API en desarrollo o producción) no se usa
// nunca: así una prueba no puede tocar una base que no sea la de pruebas aunque el .env tenga las credenciales de otra
export const URI_PRUEBAS = process.env.TEST_ATLAS_URI;
if (!URI_PRUEBAS) {
    throw new Error(
        "Falta TEST_ATLAS_URI: define en BarberPlanAPI/.env la cadena de conexión de MongoDB para las pruebas " +
        "(un usuario con permisos sobre las bases *_test). Las pruebas no usan ATLAS_URI. Ver .env.example"
    );
}
// Todo lo que se importe después en este proceso (src/db/connection.js, scripts) verá solo la conexión y la base de pruebas
process.env.ATLAS_URI = URI_PRUEBAS;
process.env.DB_NAME = NOMBRE_BD_PRUEBAS;

// Arranca la API (src/server.js) apuntando a una BD concreta. Sin tareas periódicas y con el límite
// global muy alto, porque las pruebas lanzan muchas peticiones desde una sola IP.
// limitesReales deja el límite global en su valor por defecto, para probar el 429.
// variables añade o pisa variables de entorno (NODE_ENV, TRUST_PROXY...). quitar las deja vacías: borrarlas no
// bastaría, porque dotenv volvería a rellenar desde .env las que no estén definidas en el entorno del proceso.
export const lanzarServidor = ({ puerto, nombreBD, limitesReales = false, variables = {}, quitar = [] }) => {
    exigirBaseDePruebas(nombreBD);
    const env = { ...process.env, PORT: String(puerto), DB_NAME: nombreBD, TAREAS_CITAS: "off", RATE_LIMIT_MAX: "100000", ...variables };
    if (limitesReales) delete env.RATE_LIMIT_MAX;
    for (const clave of quitar) env[clave] = "";
    const proceso = spawn(process.execPath, ["src/server.js"], {
        cwd: RAIZ_API,
        env,
        stdio: ["ignore", "pipe", "pipe"]
    });
    let salida = "";
    const acumular = (datos) => { salida += datos; };
    proceso.stdout.on("data", acumular);
    proceso.stderr.on("data", acumular);

    const salio = new Promise((resolve) => proceso.once("exit", resolve));
    const listo = new Promise((resolve, reject) => {
        const limite = setTimeout(() => reject(new Error(`El servidor no arrancó a tiempo:\n${salida}`)), 60000);
        proceso.stdout.on("data", () => {
            if (salida.includes("Servidor corriendo")) {
                clearTimeout(limite);
                resolve();
            }
        });
        salio.then((codigo) => {
            clearTimeout(limite);
            reject(new Error(`El servidor terminó con código ${codigo}:\n${salida}`));
        });
    });
    listo.catch(() => {});

    const detener = async () => {
        if (proceso.exitCode === null) {
            proceso.kill();
            await salio;
        }
    };
    return { listo, salio, salida: () => salida, detener };
};

// Crea la BD desechable (vacía, o sembrada con `sembrar`) y levanta una API propia sobre ella.
// cerrar() para la API y borra la BD. Se niega a tocar la BD de desarrollo.
export const crearEntorno = async ({ puerto, sembrar }) => {
    const nombreBD = exigirBaseDePruebas(NOMBRE_BD_PRUEBAS);

    const cliente = new MongoClient(URI_PRUEBAS);
    await cliente.connect();
    const bd = cliente.db(nombreBD);
    await bd.dropDatabase();
    if (sembrar) await sembrar(bd);

    const servidor = lanzarServidor({ puerto, nombreBD });
    const cerrar = async () => {
        await servidor.detener();
        await bd.dropDatabase();
        await cliente.close();
    };
    try {
        await servidor.listo;
    } catch (error) {
        await cerrar();
        throw error;
    }
    return { api: `http://localhost:${puerto}`, nombreBD, bd, cerrar };
};

// Cliente HTTP mínimo: devuelve { status, data, headers } sin lanzar por códigos de error
export const crearCliente = (api) => async (method, ruta, { body, token, origin, cabeceras } = {}) => {
    const headers = { "Content-Type": "application/json", ...cabeceras };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (origin) headers.Origin = origin;
    const respuesta = await fetch(api + ruta, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let data = null;
    try { data = await respuesta.json(); } catch {}
    return { status: respuesta.status, data, headers: respuesta.headers };
};

// Registra cada comprobación (PASS/FAIL) y al terminar muestra el total y fija el código de salida
export const crearComprobador = (nombreBateria) => {
    let total = 0;
    let fallos = 0;
    const check = (nombre, ok, detalle = "") => {
        total++;
        console.log(`${ok ? "PASS" : "FAIL"}  ${nombre}${detalle ? "  -> " + detalle : ""}`);
        if (!ok) fallos++;
    };
    const terminar = () => {
        console.log(`\nBatería de ${nombreBateria}: ${total} comprobaciones, ${fallos} fallos`);
        process.exitCode = fallos === 0 ? 0 : 1;
    };
    return { check, terminar };
};
