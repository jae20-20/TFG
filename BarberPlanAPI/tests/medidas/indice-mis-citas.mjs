// ¿Se beneficia GET /citas/mis-citas de un índice por clienteId (y fecha)? Mide la consulta real (getCitasByClienteId)
// con y sin índice sobre un volumen grande y compara una variante con el $sort antes de los $lookup.
//
//   node tests/medidas/indice-mis-citas.mjs [--citas=400] [--repeticiones=100]
//
// citas = citas por barbero (60 barberos): 400 -> 24.000 citas en total. Usa la BD desechable BarberPlan_indices_test.
import { exigirBaseDePruebas } from "../entorno.mjs"; // carga el .env de la API y fija la conexión de pruebas
import { sembrarCarga } from "./datos-carga.mjs";
import { ObjectId } from "./mongodb-api.mjs";

const NOMBRE_BD = exigirBaseDePruebas("BarberPlan_indices_test");
const argumentos = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v = "true"] = a.slice(2).split("="); return [k, v]; }));
const CITAS_POR_BARBERO = Number(argumentos.citas) || 400;
const REPETICIONES = Number(argumentos.repeticiones) || 100;

process.env.DB_NAME = NOMBRE_BD; // antes de importar el código de src/: connection.js lo lee al cargarse
const { client, connectDB, db } = await import("../../src/db/connection.js");
const { getCitasByClienteId } = await import("../../src/models/citaModel.js");
const { INDICES } = await import("../../src/db/indices.js");

const citas = db.collection("Citas");
const redondear = (n) => Math.round(n * 10) / 10;

// Misma consulta que getCitasByClienteId, con el $sort justo después del $match (puede usar el índice y ordena 60 citas, no 60 × lookups)
const consultaOrdenadaAntes = (clienteId) => citas.aggregate([
    { $match: { clienteId } },
    { $sort: { fecha: -1 } },
    { $lookup: { from: "Barberias", localField: "barberiaId", foreignField: "_id", as: "barberia" } },
    { $lookup: { from: "Usuarios", localField: "barberoId", foreignField: "_id", as: "barbero", pipeline: [{ $project: { _id: 0, nombre: 1, apellido: 1 } }] } },
    { $unwind: { path: "$barberia", preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$barbero", preserveNullAndEmptyArrays: true } },
    { $project: { "barberia.adminId": 0, "resena.imagen": 0 } }
]).toArray();

const medir = async (ejecutar) => {
    await ejecutar(); // calentamiento
    const tiempos = [];
    for (let i = 0; i < REPETICIONES; i++) {
        const inicio = performance.now();
        await ejecutar();
        tiempos.push(performance.now() - inicio);
    }
    tiempos.sort((a, b) => a - b);
    return { mediaMs: redondear(tiempos.reduce((s, t) => s + t, 0) / tiempos.length), p95Ms: redondear(tiempos[Math.ceil(0.95 * tiempos.length) - 1]) };
};

// Solo el $match + $sort (la parte que usa el índice), con explain: qué plan elige y cuántos documentos lee
const plan = async (clienteId) => {
    const explicacion = await citas.find({ clienteId }).sort({ fecha: -1 }).explain("executionStats");
    const texto = JSON.stringify(explicacion.queryPlanner.winningPlan);
    return {
        etapas: ["IXSCAN", "COLLSCAN", "SORT"].filter((e) => texto.includes(e)).join("+"),
        documentosLeidos: explicacion.executionStats.totalDocsExamined,
        clavesLeidas: explicacion.executionStats.totalKeysExamined,
        devueltos: explicacion.executionStats.nReturned
    };
};

const bd = client.db(NOMBRE_BD);
try {
    await connectDB();
    await bd.dropDatabase();
    const datos = await sembrarCarga(bd, { citasPorBarbero: CITAS_POR_BARBERO });
    const clienteId = new ObjectId(datos.clientePrueba._id);
    console.log("Datos:", datos.resumen);

    const indiceActual = INDICES.find((i) => i.coleccion === "Citas" && i.opciones.name === "clienteId_fecha");
    console.log(`Índice que ya crea el servidor al arrancar: Citas.${indiceActual.opciones.name} ${JSON.stringify(indiceActual.clave)}\n`);

    const filas = [];
    for (const [nombre, indices] of [["sin índice por cliente", []], ["con clienteId_fecha (el actual)", [indiceActual]]]) {
        for (const ix of await citas.indexes()) if (ix.name !== "_id_") await citas.dropIndex(ix.name);
        for (const ix of indices) await citas.createIndex(ix.clave, ix.opciones);
        const p = await plan(clienteId);
        const real = await medir(() => getCitasByClienteId(clienteId.toString()));
        const ordenadoAntes = await medir(() => consultaOrdenadaAntes(clienteId));
        filas.push({ variante: nombre, plan: p.etapas, documentosLeidos: p.documentosLeidos, devueltos: p.devueltos, "mis-citas actual (media ms)": real.mediaMs, "(p95 ms)": real.p95Ms, "$sort antes de $lookup (media ms)": ordenadoAntes.mediaMs, "(p95 ms) ": ordenadoAntes.p95Ms });
    }
    console.table(filas);
    console.log(`Repeticiones por medida: ${REPETICIONES}, secuenciales, Atlas remoto: cada ida y vuelta suma su latencia de red.`);
} finally {
    await bd.dropDatabase();
    await client.close();
}
