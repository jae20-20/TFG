// Infraestructura común de las baterías de pruebas: base de datos desechable, API propia y utilidades.
// Las baterías se ejecutan una detrás de otra (comparten BD), nunca en paralelo.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";

export const RAIZ_API = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(RAIZ_API, ".env"), quiet: true });

export const NOMBRE_BD_PRUEBAS = process.env.TEST_DB_NAME || "BarberPlan_test";

// Arranca la API (src/server.js) apuntando a una BD concreta. Sin tareas periódicas y con el límite
// global muy alto, porque las pruebas lanzan muchas peticiones desde una sola IP.
export const lanzarServidor = ({ puerto, nombreBD }) => {
    const proceso = spawn(process.execPath, ["src/server.js"], {
        cwd: RAIZ_API,
        env: { ...process.env, PORT: String(puerto), DB_NAME: nombreBD, TAREAS_CITAS: "off", RATE_LIMIT_MAX: "100000" },
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
    const nombreBD = NOMBRE_BD_PRUEBAS;
    if (nombreBD === "BarberPlan") {
        throw new Error("Las pruebas no pueden ejecutarse contra la base de datos de desarrollo (BarberPlan)");
    }

    const cliente = new MongoClient(process.env.ATLAS_URI);
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
export const crearCliente = (api) => async (method, ruta, { body, token, origin } = {}) => {
    const headers = { "Content-Type": "application/json" };
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
