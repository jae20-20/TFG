// Prueba de carga (RNF14): 100 usuarios simultáneos. Fuera de `npm test` (tarda ~7 min y castiga Atlas).
//
//   node tests/medidas/carga.mjs [--bd=atlas|local] [--conexiones=100] [--duracion=30] [--atlas=M0]
//                                [--rutas=listado,ficha] [--salida=nombre]
//
//   --bd=atlas  (por defecto) MongoDB Atlas (TEST_ATLAS_URI del .env), siempre sobre una base _test. Informe: resultados/carga.json
//   --bd=local  réplica de MongoDB de un nodo en este equipo (mongodb-memory-server; las reservas usan transacciones,
//               que exigen réplica). La primera vez descarga el binario de mongod. Informe: resultados/carga-local.json
//   --salida    nombre del informe (sin .json), por ejemplo para guardar dos pasadas: --salida=carga-local-pasada1
//
// Tres escenarios por ruta, todos con N conexiones abiertas (100 usuarios):
//   normal      una petición cada 5 s por usuario (20 req/s en total)   -> se aplica el criterio de aceptación
//   intenso     una petición cada 2 s por usuario (50 req/s en total)   -> se aplica el criterio de aceptación
//   saturacion  las N conexiones sin pausa                               -> capacidad máxima (req/s), sin criterio
// «100 conexiones sin pausa» mide saturación, no 100 usuarios reales: por eso el criterio va sobre los dos primeros.
//
// Qué hace:
//   1. Crea la BD desechable BarberPlan_carga_test en Atlas y la siembra (datos-carga.mjs).
//   2. Levanta la API sobre esa BD con RATE_LIMIT_MAX altísimo (el límite real, 100 peticiones cada 15 min por IP,
//      cortaría la prueba al instante) y sin tareas periódicas.
//   3. Mide cada ruta en los tres escenarios, 30 s cada uno (autocannon, opción overallRate para el ritmo).
//   4. Imprime el informe y guarda el JSON en tests/medidas/resultados/carga.json.
//   5. Para la API y borra la BD (también con Ctrl+C).
//
// autocannon vive en tests/medidas/node_modules (se instala la primera vez) para no tocar las dependencias de la API.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RAIZ_API, URI_PRUEBAS, exigirBaseDePruebas, lanzarServidor } from "../entorno.mjs";
import { fechaRelativa } from "../semilla.mjs";
import { PW, sembrarCarga } from "./datos-carga.mjs";
import { MongoClient } from "./mongodb-api.mjs";

const DIR_MEDIDAS = path.dirname(fileURLToPath(import.meta.url));
const DIR_RESULTADOS = path.join(DIR_MEDIDAS, "resultados");
const DIR_INTERMEDIOS = path.join(DIR_RESULTADOS, "intermedios");
const NOMBRE_BD = exigirBaseDePruebas("BarberPlan_carga_test");
const PUERTO = 5085;

const argumentos = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const [clave, valor = "true"] = a.slice(2).split("=");
    return [clave, valor];
}));
const MODO_BD = argumentos.bd || "atlas";
if (!["atlas", "local"].includes(MODO_BD)) throw new Error(`--bd debe ser atlas o local (recibido: ${MODO_BD})`);
const NOMBRE_INFORME = argumentos.salida || (MODO_BD === "atlas" ? "carga" : "carga-local");
const CONEXIONES = Number(argumentos.conexiones) || 100;
const DURACION_S = Number(argumentos.duracion) || 30;
const CALENTAMIENTO_S = 3;
const PLAN_ATLAS = argumentos.atlas || "[POR CONFIRMAR]";

// Criterio de aceptación (RNF14), solo para los escenarios de uso real (normal e intenso)
const CRITERIO = {
    p99MaxMs: 1000,       // el 99 % de las peticiones responde en menos de 1 s
    maxErroresNo2xx: 0,   // ninguna respuesta que no sea 2xx
    maxErroresRed: 0,     // ni errores de conexión
    maxTimeouts: 0        // ni tiempos de espera agotados
};
// Para que un escenario con ritmo cuente, la carga realmente aplicada debe llegar a este porcentaje del objetivo
// (si el servidor no pudiera con el ritmo, la medida no representaría ese escenario)
const CARGA_MINIMA = 0.9;

const ESCENARIOS = [
    { id: "normal", nombre: "Uso normal", detalle: `${CONEXIONES} usuarios, 1 petición cada 5 s`, reqPorSegundo: CONEXIONES / 5, criterio: true },
    { id: "intenso", nombre: "Uso intenso", detalle: `${CONEXIONES} usuarios, 1 petición cada 2 s`, reqPorSegundo: CONEXIONES / 2, criterio: true },
    { id: "saturacion", nombre: "Saturación", detalle: `${CONEXIONES} conexiones sin pausa (capacidad máxima)`, reqPorSegundo: null, criterio: false }
];

// autocannon se instala la primera vez, desde tests/medidas y sin las variables npm_* del script que nos lance
const cargarAutocannon = () => {
    const requerir = createRequire(path.join(DIR_MEDIDAS, "package.json"));
    try {
        return requerir("autocannon");
    } catch {
        console.log("Instalando autocannon en tests/medidas (solo la primera vez)...");
        const env = Object.fromEntries(Object.entries(process.env).filter(([clave]) => !clave.toLowerCase().startsWith("npm_")));
        const instalacion = spawnSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: DIR_MEDIDAS, env, stdio: "inherit", shell: true });
        if (instalacion.status !== 0) throw new Error("No se pudo instalar autocannon en tests/medidas (npm install)");
        return requerir("autocannon");
    }
};

// La réplica local vive en tests/medidas/node_modules (se instala con autocannon)
const arrancarReplicaLocal = async () => {
    const requerir = createRequire(path.join(DIR_MEDIDAS, "package.json"));
    let MongoMemoryReplSet;
    try {
        ({ MongoMemoryReplSet } = requerir("mongodb-memory-server"));
    } catch {
        throw new Error("Falta mongodb-memory-server: ejecuta «npm install» en tests/medidas");
    }
    console.log("Arrancando la réplica local (la primera vez descarga mongod)...");
    return await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
};

// ==================== Medición ====================
const redondear = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

const medir = async (autocannon, ruta, conexiones, duracion, reqPorSegundo, intermedio) => {
    const resultado = await autocannon({
        url: ruta.url, connections: conexiones, duration: duracion, headers: ruta.headers, timeout: 10,
        ...(reqPorSegundo && { overallRate: reqPorSegundo })
    });
    if (intermedio) {
        fs.mkdirSync(DIR_INTERMEDIOS, { recursive: true });
        fs.writeFileSync(path.join(DIR_INTERMEDIOS, `${NOMBRE_INFORME}-${ruta.nombre}-${intermedio}.json`), JSON.stringify(resultado, null, 2));
    }
    return {
        conexiones,
        duracionS: duracion,
        peticiones: resultado.requests.total,
        peticionesPorSegundo: redondear(resultado.requests.average),
        latenciaMediaMs: redondear(resultado.latency.average),
        latenciaP50Ms: resultado.latency.p50,
        latenciaP99Ms: resultado.latency.p99,
        latenciaMaxMs: resultado.latency.max,
        respuestas2xx: resultado["2xx"],
        respuestasNo2xx: resultado.non2xx,
        erroresRed: resultado.errors,
        timeouts: resultado.timeouts,
        bytesPorSegundo: Math.round(resultado.throughput.average)
    };
};

const valorar = (escenario, medida) => {
    const cargaAplicada = escenario.reqPorSegundo === null ? null : redondear(medida.peticionesPorSegundo / escenario.reqPorSegundo, 2);
    const comprobaciones = {
        p99: medida.latenciaP99Ms < CRITERIO.p99MaxMs,
        no2xx: medida.respuestasNo2xx <= CRITERIO.maxErroresNo2xx,
        errores: medida.erroresRed <= CRITERIO.maxErroresRed,
        timeouts: medida.timeouts <= CRITERIO.maxTimeouts,
        cargaAplicada: cargaAplicada === null || cargaAplicada >= CARGA_MINIMA
    };
    return { cargaAplicada, comprobaciones, cumple: Object.values(comprobaciones).every(Boolean) };
};

// ==================== Ejecución ====================
let replicaLocal = null;
let cliente = null;
let bd = null;
let servidor = null;
let limpiado = false;

const limpiar = async () => {
    if (limpiado) return;
    limpiado = true;
    await servidor?.detener();
    await bd?.dropDatabase();
    await cliente?.close();
    await replicaLocal?.stop();
};
process.on("SIGINT", async () => { await limpiar(); process.exit(130); });

try {
    const autocannon = cargarAutocannon();

    if (MODO_BD === "local") replicaLocal = await arrancarReplicaLocal();
    const uriBD = MODO_BD === "local" ? replicaLocal.getUri() : URI_PRUEBAS;
    cliente = new MongoClient(uriBD);
    await cliente.connect();
    bd = cliente.db(NOMBRE_BD);
    const versionMongo = (await cliente.db("admin").command({ buildInfo: 1 })).version;

    await bd.dropDatabase();
    const inicioSiembra = Date.now();
    const datos = await sembrarCarga(bd);
    console.log(`BD ${NOMBRE_BD} sembrada en ${((Date.now() - inicioSiembra) / 1000).toFixed(1)} s:`, datos.resumen);

    servidor = lanzarServidor({
        puerto: PUERTO, nombreBD: NOMBRE_BD,
        variables: { RATE_LIMIT_MAX: "1000000000", ...(MODO_BD === "local" && { ATLAS_URI: uriBD }) }
    });
    await servidor.listo;
    const api = `http://localhost:${PUERTO}`;

    const login = await fetch(`${api}/usuarios/login`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ correo: datos.clientePrueba.correo, pw: PW })
    });
    const token = (await login.json()).token;
    if (!token) throw new Error(`No se pudo iniciar sesión con el cliente de prueba (${login.status})`);

    const todasLasRutas = [
        // Control: no toca la BD. Da el techo de la API en este equipo y permite separar lo que cuesta Node/Express y el
        // propio autocannon de lo que cuesta Atlas. Solo se mide en saturación y no entra en el veredicto
        { nombre: "control", control: true, descripcion: "GET / (control: sin base de datos)", url: `${api}/` },
        { nombre: "listado", descripcion: "GET /barberias (listado público)", url: `${api}/barberias` },
        { nombre: "ficha", descripcion: "GET /barberias/:id (ficha de una barbería)", url: `${api}/barberias/${datos.barberiaMedida._id}` },
        { nombre: "disponibilidad", descripcion: "GET /citas/disponibilidad/:barbero/:fecha (huecos de un día)", url: `${api}/citas/disponibilidad/${datos.barberoMedido._id}/${fechaRelativa(3)}?barberiaId=${datos.barberiaMedida._id}` },
        { nombre: "mis-citas", descripcion: "GET /citas/mis-citas (con sesión: citas del cliente)", url: `${api}/citas/mis-citas`, headers: { Authorization: `Bearer ${token}` } }
    ];
    const rutas = argumentos.rutas ? todasLasRutas.filter((r) => argumentos.rutas.split(",").includes(r.nombre)) : todasLasRutas;

    const resultados = [];
    for (const ruta of rutas) {
        console.log(`\n== ${ruta.descripcion}`);
        // Calentamiento (conexiones TCP, pool de Mongo, JIT): no cuenta en los resultados
        await medir(autocannon, ruta, 10, CALENTAMIENTO_S, null, null);
        const escenarios = {};
        for (const escenario of ESCENARIOS) {
            if (ruta.control && escenario.id !== "saturacion") continue;
            const medida = await medir(autocannon, ruta, CONEXIONES, DURACION_S, escenario.reqPorSegundo, escenario.id);
            const valoracion = ruta.control || !escenario.criterio ? null : valorar(escenario, medida);
            escenarios[escenario.id] = { ...medida, ...(escenario.reqPorSegundo && { objetivoReqPorSegundo: escenario.reqPorSegundo }), ...(valoracion && { valoracion }) };
            console.log(`   ${escenario.nombre.padEnd(11)} ${String(medida.peticionesPorSegundo).padStart(7)} req/s, media ${medida.latenciaMediaMs} ms, p99 ${medida.latenciaP99Ms} ms, no 2xx ${medida.respuestasNo2xx}, errores ${medida.erroresRed}, timeouts ${medida.timeouts}` +
                (valoracion ? `  ->  ${valoracion.cumple ? "CUMPLE" : "NO CUMPLE " + JSON.stringify(valoracion.comprobaciones)}` : ""));
        }
        resultados.push({ ruta: ruta.nombre, descripcion: ruta.descripcion, ...(ruta.control && { control: true }), escenarios });
    }
    const medidas = resultados.filter((r) => !r.control);
    const cumpleEscenario = (r, id) => r.escenarios[id]?.valoracion?.cumple === true;

    const informe = {
        fecha: new Date().toISOString(),
        requisito: "RNF14: 100 usuarios simultáneos sin pérdida apreciable de rendimiento",
        condiciones: {
            modoBD: MODO_BD,
            baseDeDatos: MODO_BD === "atlas"
                ? `MongoDB Atlas ${versionMongo} (plan ${PLAN_ATLAS}), BD desechable ${NOMBRE_BD}`
                : `mongod ${versionMongo} local, réplica de un nodo (mongodb-memory-server), BD desechable ${NOMBRE_BD}`,
            servidorYCliente: MODO_BD === "atlas"
                ? "API (Node.js) y autocannon en el mismo equipo: compiten por la CPU"
                : "API (Node.js), autocannon y mongod en el mismo equipo: compiten por la CPU, el disco y la memoria",
            equipo: `${os.cpus()[0]?.model.trim()} (${os.cpus().length} hilos), ${Math.round(os.totalmem() / 1024 ** 3)} GB RAM, ${os.platform()} ${os.release()}`,
            node: process.version,
            conexionesSimultaneas: CONEXIONES,
            duracionPorMedidaS: DURACION_S,
            calentamientoS: CALENTAMIENTO_S,
            limiteDePeticionesDeLaApi: "RATE_LIMIT_MAX subido a 1000000000 (el valor real, 100 por 15 min y por IP, cortaría la prueba)",
            tareasPeriodicas: "desactivadas (TAREAS_CITAS=off)",
            datos: datos.resumen
        },
        escenarios: ESCENARIOS,
        criterio: { ...CRITERIO, cargaMinimaAplicada: CARGA_MINIMA, seAplicaA: ESCENARIOS.filter((e) => e.criterio).map((e) => e.id) },
        resultados,
        cumpleRNF14: medidas.length > 0 && medidas.every((r) => cumpleEscenario(r, "normal") && cumpleEscenario(r, "intenso"))
    };
    fs.mkdirSync(DIR_RESULTADOS, { recursive: true });
    const archivo = path.join(DIR_RESULTADOS, `${NOMBRE_INFORME}.json`);

    // Con --rutas se actualiza el informe existente: las rutas medidas ahora sustituyen a las anteriores (que se conservan
    // en medidaAnterior) y el resto se queda como estaba
    if (argumentos.rutas && fs.existsSync(archivo)) {
        const previo = JSON.parse(fs.readFileSync(archivo, "utf8"));
        const remedidas = new Set(resultados.map((r) => r.ruta));
        const nuevas = resultados.map((r) => {
            const anterior = previo.resultados.find((p) => p.ruta === r.ruta);
            return anterior ? { ...r, medidaAnterior: { fecha: previo.actualizaciones?.at(-1)?.fecha ?? previo.fecha, escenarios: anterior.escenarios } } : r;
        });
        const orden = todasLasRutas.map((r) => r.nombre);
        informe.resultados = [...previo.resultados.filter((p) => !remedidas.has(p.ruta)), ...nuevas]
            .sort((a, b) => orden.indexOf(a.ruta) - orden.indexOf(b.ruta));
        informe.condicionesPrimeraMedida = previo.condicionesPrimeraMedida ?? previo.condiciones;
        informe.actualizaciones = [...(previo.actualizaciones ?? []), { fecha: informe.fecha, rutas: [...remedidas], baseDeDatos: informe.condiciones.baseDeDatos }];
        const todas = informe.resultados.filter((r) => !r.control);
        informe.cumpleRNF14 = todas.length > 0 && todas.every((r) => cumpleEscenario(r, "normal") && cumpleEscenario(r, "intenso"));
    }
    fs.writeFileSync(archivo, JSON.stringify(informe, null, 2));

    console.log("\n================ PRUEBA DE CARGA: RESULTADO ================");
    console.log(`Criterio (uso normal e intenso): p99 < ${CRITERIO.p99MaxMs} ms, 0 respuestas no 2xx, 0 errores, 0 timeouts, y carga aplicada ≥ ${CARGA_MINIMA * 100} % del objetivo`);
    for (const r of resultados) {
        for (const e of ESCENARIOS) {
            const m = r.escenarios[e.id];
            if (!m) continue;
            const veredicto = r.control || !e.criterio ? "         " : m.valoracion.cumple ? "CUMPLE   " : "NO CUMPLE";
            console.log(`${veredicto}  ${r.ruta.padEnd(15)} ${e.nombre.padEnd(11)} ${String(m.peticionesPorSegundo).padStart(7)} req/s, media ${m.latenciaMediaMs} ms, p99 ${m.latenciaP99Ms} ms`);
        }
    }
    console.log(`\nRNF14 (uso normal e intenso): ${informe.cumpleRNF14 ? "SE CUMPLE" : "NO SE CUMPLE"}. Informe: ${path.relative(RAIZ_API, archivo)}`);
    process.exitCode = informe.cumpleRNF14 ? 0 : 1;
} finally {
    await limpiar();
}
