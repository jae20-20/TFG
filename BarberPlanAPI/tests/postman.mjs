// Ejecuta la colección de Postman (postman/) con newman sobre la BD desechable, en tres pasadas:
//   1. Carpetas 00 a 07 contra una API con el límite global subido (envían más de 100 peticiones).
//   2. Carpeta 08 (RNF5) contra una API recién arrancada con los límites reales.
//   3. Carpeta 09 (formato de credenciales) contra otra API recién arrancada: usa los 10 intentos de
//      login y registro por IP, que la pasada 1 ya ha agotado en la suya.
// Al terminar para las APIs y borra la BD. Opciones:
//   --mantener  no ejecuta newman: deja las tres APIs y la BD sembrada levantadas para usar el Runner
//               de Postman a mano, e imprime los valores del entorno. Ctrl+C para y borra todo.
//   --limpiar   solo borra la BD desechable y el entorno generado (por si quedaron de una ejecución interrumpida).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { MongoClient } from "mongodb";
import { NOMBRE_BD_PRUEBAS, RAIZ_API, lanzarServidor } from "./entorno.mjs";
import { sembrarPostman } from "./semilla-postman.mjs";

const DIR_POSTMAN = path.join(RAIZ_API, "postman");
const COLECCION = path.join(DIR_POSTMAN, "BarberPlan_API.postman_collection.json");
const PLANTILLA_ENTORNO = path.join(DIR_POSTMAN, "BarberPlan_Local.postman_environment.json");
const ENTORNO_GENERADO = path.join(os.tmpdir(), "BarberPlan_test.postman_environment.json");
const CARPETA_LIMITES = "08 · Límites de peticiones (RNF5)";
const CARPETA_CREDENCIALES = "09 · Formato de credenciales (registro y login)";
const PUERTO_PRINCIPAL = 5093;
const PUERTO_LIMITES = 5092;
const PUERTO_CREDENCIALES = 5091;

const argumentos = process.argv.slice(2);
const mantener = argumentos.includes("--mantener");
const soloLimpiar = argumentos.includes("--limpiar");

if (NOMBRE_BD_PRUEBAS === "BarberPlan") {
    throw new Error("La colección no puede ejecutarse contra la base de datos de desarrollo (BarberPlan)");
}

// newman vive en postman/node_modules para no alterar las dependencias de la API. Se instala la primera
// vez, desde la carpeta postman y sin las variables npm_* del script que nos lanza: con ellas, npm añadía
// la propia API como dependencia de postman/package.json (un enlace circular)
const cargarNewman = () => {
    const requerir = createRequire(path.join(DIR_POSTMAN, "package.json"));
    try {
        return requerir("newman");
    } catch {
        const env = Object.fromEntries(Object.entries(process.env).filter(([clave]) => !clave.toLowerCase().startsWith("npm_")));
        const instalacion = spawnSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: DIR_POSTMAN, env, stdio: "inherit", shell: true });
        if (instalacion.status !== 0) throw new Error("No se pudo instalar newman en postman/ (npm install)");
        return requerir("newman");
    }
};

const coleccion = JSON.parse(fs.readFileSync(COLECCION, "utf8"));
const carpetasPrincipales = coleccion.item.map((carpeta) => carpeta.name).filter((nombre) => nombre !== CARPETA_LIMITES && nombre !== CARPETA_CREDENCIALES);

// Entorno «BarberPlan - Local» con la URL de la API y las credenciales sembradas
const crearEntornoPostman = (baseUrl, datos) => {
    const entorno = JSON.parse(fs.readFileSync(PLANTILLA_ENTORNO, "utf8"));
    const valores = { ...datos, baseUrl };
    entorno.name = `BarberPlan - Pruebas (${NOMBRE_BD_PRUEBAS})`;
    entorno.values = entorno.values.map((v) => (v.key in valores ? { ...v, value: valores[v.key] } : v));
    return entorno;
};

const ejecutarNewman = (newman, folder, environment) => new Promise((resolve, reject) => {
    newman.run({ collection: COLECCION, environment, folder, reporters: ["cli"] }, (error, resumen) => {
        if (error) reject(error);
        else resolve(resumen);
    });
});

// Carpeta de primer nivel de una petición ejecutada
const carpetaDe = (item) => {
    let actual = item;
    while (actual.parent()?.parent()) actual = actual.parent();
    return actual.name;
};

const contarDefinidas = (items) => items.reduce((total, it) => total + (it.item ? contarDefinidas(it.item) : 1), 0);

// Percentiles por rango más cercano: siempre es un tiempo realmente medido
const metricasTiempo = (ejecuciones) => {
    const tiempos = ejecuciones.filter((e) => e.response).map((e) => e.response.responseTime).sort((a, b) => a - b);
    const percentil = (p) => tiempos[Math.max(0, Math.ceil((p / 100) * tiempos.length) - 1)];
    return {
        media: tiempos.reduce((suma, t) => suma + t, 0) / tiempos.length,
        mediana: percentil(50),
        p95: percentil(95),
        maximo: tiempos[tiempos.length - 1]
    };
};

const informe = (pasadas) => {
    const filas = new Map(coleccion.item.map((carpeta) => [carpeta.name, {
        definidas: contarDefinidas(carpeta.item), enviadas: 0, comprobaciones: 0, fallidas: 0, tiempo: 0
    }]));
    const fallos = [];

    for (const { resumen } of pasadas) {
        for (const ejecucion of resumen.run.executions) {
            const fila = filas.get(carpetaDe(ejecucion.item));
            if (ejecucion.response) {
                fila.enviadas++;
                fila.tiempo += ejecucion.response.responseTime;
            }
            for (const { assertion, error, skipped } of ejecucion.assertions || []) {
                if (skipped) continue;
                fila.comprobaciones++;
                if (error) {
                    fila.fallidas++;
                    fallos.push(`${ejecucion.item.parent().name} / ${ejecucion.item.name}: «${assertion}» -> ${error.message}`);
                }
            }
        }
        // Errores de script o de red, que no son comprobaciones
        for (const fallo of resumen.run.failures) {
            if (fallo.error.name !== "AssertionError") fallos.push(`${fallo.source?.name}: ${fallo.error.name}: ${fallo.error.message}`);
        }
    }

    const total = { definidas: 0, enviadas: 0, comprobaciones: 0, fallidas: 0, tiempo: 0 };
    const columnas = ["Carpeta", "Definidas", "Enviadas", "Comprob.", "Superadas", "Fallidas", "T. medio"];
    const lineas = [];
    for (const [nombre, f] of [...filas, ["TOTAL", total]]) {
        if (nombre !== "TOTAL") for (const clave of Object.keys(total)) total[clave] += f[clave];
        lineas.push([nombre, f.definidas, f.enviadas, f.comprobaciones, f.comprobaciones - f.fallidas, f.fallidas,
            f.enviadas ? `${(f.tiempo / f.enviadas).toFixed(1)} ms` : "-"]);
    }
    const anchos = columnas.map((c, i) => Math.max(c.length, ...lineas.map((l) => String(l[i]).length)));
    const formatear = (l) => l.map((v, i) => (i === 0 ? String(v).padEnd(anchos[i]) : String(v).padStart(anchos[i]))).join("  ");

    console.log("\n================ COLECCIÓN DE POSTMAN: RESULTADO ================");
    console.log(`BD: ${NOMBRE_BD_PRUEBAS} (borrada al terminar)`);
    for (const { titulo, resumen } of pasadas) {
        const { stats, timings } = resumen.run;
        console.log(`${titulo}: ${stats.requests.total} peticiones, ${stats.assertions.total} comprobaciones, ` +
            `${stats.assertions.failed} fallidas, ${((timings.completed - timings.started) / 1000).toFixed(1)} s`);
        const { media, mediana, p95, maximo } = metricasTiempo(resumen.run.executions);
        console.log(`  Tiempo de respuesta: media ${media.toFixed(1)} ms, mediana ${mediana} ms, p95 ${p95} ms, máximo ${maximo} ms`);
    }
    console.log("");
    console.log(formatear(columnas));
    console.log(anchos.map((a) => "-".repeat(a)).join("  "));
    lineas.forEach((l, i) => {
        if (i === lineas.length - 1) console.log(anchos.map((a) => "-".repeat(a)).join("  "));
        console.log(formatear(l));
    });
    if (fallos.length) {
        console.log(`\nFallos (${fallos.length}):`);
        fallos.forEach((f) => console.log(`  - ${f}`));
    }
    return fallos.length;
};

const cliente = new MongoClient(process.env.ATLAS_URI);
await cliente.connect();
const bd = cliente.db(NOMBRE_BD_PRUEBAS);

const borrarBD = async () => {
    await bd.dropDatabase();
    await cliente.close();
};

if (soloLimpiar) {
    await borrarBD();
    fs.rmSync(ENTORNO_GENERADO, { force: true });
    console.log(`BD ${NOMBRE_BD_PRUEBAS} y entorno generado borrados`);
} else {
    await bd.dropDatabase();
    const datos = await sembrarPostman(bd);
    const servidores = [];
    const arrancar = async (puerto, limitesReales) => {
        const servidor = lanzarServidor({ puerto, nombreBD: NOMBRE_BD_PRUEBAS, limitesReales });
        servidores.push(servidor);
        await servidor.listo;
        return servidor;
    };
    const cerrarTodo = async () => {
        for (const servidor of servidores) await servidor.detener();
        await borrarBD();
    };

    if (mantener) {
        try {
            await arrancar(PUERTO_PRINCIPAL, false);
            await arrancar(PUERTO_LIMITES, true);
            await arrancar(PUERTO_CREDENCIALES, false);
        } catch (error) {
            await cerrarTodo();
            throw error;
        }
        const baseUrl = `http://localhost:${PUERTO_PRINCIPAL}`;
        fs.writeFileSync(ENTORNO_GENERADO, JSON.stringify(crearEntornoPostman(baseUrl, datos), null, 2));

        console.log(`\nBD ${NOMBRE_BD_PRUEBAS} sembrada y tres APIs levantadas:`);
        console.log(`  ${baseUrl}  límite global subido: carpetas 00 a 07, juntas y una única vez`);
        console.log(`  http://localhost:${PUERTO_LIMITES}  límites reales: carpeta 08, SOLA y una única vez`);
        console.log(`  http://localhost:${PUERTO_CREDENCIALES}  carpeta 09, SOLA y una única vez (cambia baseUrl en el entorno)`);
        console.log("\nValores para el entorno de Postman:");
        console.log(`  ${"baseUrl".padEnd(18)} ${baseUrl}`);
        for (const [clave, valor] of Object.entries(datos)) console.log(`  ${clave.padEnd(18)} ${valor}`);
        console.log(`\nO importa este entorno ya relleno en Postman: ${ENTORNO_GENERADO}`);
        console.log("Login y registro admiten 10 peticiones cada 15 minutos por IP y cada API los gasta en su pasada: para repetir una, reinicia este script.");
        console.log("\n>>> Pulsa Ctrl+C para parar las APIs y BORRAR la BD. Si el proceso se cierra de otra forma, borra la BD con: npm run test:postman -- --limpiar\n");

        let cerrando = false;
        const salir = async () => {
            if (cerrando) return;
            cerrando = true;
            await cerrarTodo();
            fs.rmSync(ENTORNO_GENERADO, { force: true });
            console.log(`APIs paradas y BD ${NOMBRE_BD_PRUEBAS} borrada`);
            process.exit(0);
        };
        process.on("SIGINT", salir);
        process.on("SIGTERM", salir);
    } else {
        const newman = cargarNewman();
        const pasadas = [];
        try {
            const principal = await arrancar(PUERTO_PRINCIPAL, false);
            pasadas.push({ titulo: "Pasada 1 (carpetas 00 a 07, límite global subido)",
                resumen: await ejecutarNewman(newman, carpetasPrincipales, crearEntornoPostman(`http://localhost:${PUERTO_PRINCIPAL}`, datos)) });
            await principal.detener();

            const limites = await arrancar(PUERTO_LIMITES, true);
            pasadas.push({ titulo: "Pasada 2 (carpeta 08, límites reales)",
                resumen: await ejecutarNewman(newman, [CARPETA_LIMITES], crearEntornoPostman(`http://localhost:${PUERTO_LIMITES}`, datos)) });
            await limites.detener();

            await arrancar(PUERTO_CREDENCIALES, false);
            pasadas.push({ titulo: "Pasada 3 (carpeta 09, API nueva)",
                resumen: await ejecutarNewman(newman, [CARPETA_CREDENCIALES], crearEntornoPostman(`http://localhost:${PUERTO_CREDENCIALES}`, datos)) });
        } finally {
            await cerrarTodo();
        }
        const fallos = informe(pasadas);
        process.exitCode = fallos === 0 ? 0 : 1;
    }
}
