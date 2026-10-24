// Migración: guarda en minúsculas y sin espacios los correos de Usuarios (regla de normalizarCorreo).
// Hay que ejecutarla antes de arrancar el servidor con el índice único de correo.
//
//   node scripts/normalizar-correos.mjs            simulación: solo informa, no escribe
//   node scripts/normalizar-correos.mjs --aplicar  escribe los cambios
//
// Si dos usuarios acaban con el mismo correo normalizado, o alguno no tiene correo, avisa y termina
// con código 1 sin modificar nada, aunque se pase --aplicar. Usa DB_NAME como el servidor.
import { client, connectDB, db } from "../src/db/connection.js";
import { normalizarCorreo } from "../src/models/userModel.js";

const aplicar = process.argv.includes("--aplicar");

await connectDB();
const usuarios = await db.collection("Usuarios").find({}, { projection: { correo: 1, usuario: 1 } }).toArray();
console.log(`Base de datos: ${db.databaseName} (${usuarios.length} usuarios)`);

const sinCorreo = usuarios.filter((u) => typeof u.correo !== "string" || !u.correo.trim());
const porCorreo = new Map();
for (const u of usuarios.filter((u) => !sinCorreo.includes(u))) {
    const clave = normalizarCorreo(u.correo);
    porCorreo.set(clave, [...(porCorreo.get(clave) ?? []), u]);
}
const duplicados = [...porCorreo.entries()].filter(([, lista]) => lista.length > 1);

if (sinCorreo.length > 0 || duplicados.length > 0) {
    for (const u of sinCorreo) {
        console.log(`SIN CORREO: _id ${u._id} (usuario ${u.usuario})`);
    }
    for (const [correo, lista] of duplicados) {
        console.log(`DUPLICADO "${correo}": ${lista.map((u) => `${u._id} (${u.correo})`).join(", ")}`);
    }
    console.log("\nNo se ha modificado nada. Resuelve estos casos a mano y vuelve a ejecutar.");
    await client.close();
    process.exit(1);
}

const cambios = usuarios.filter((u) => u.correo !== normalizarCorreo(u.correo));
for (const u of cambios) {
    console.log(`${u._id}: "${u.correo}" -> "${normalizarCorreo(u.correo)}"`);
}
console.log(`\nCorreos por normalizar: ${cambios.length}`);

if (!aplicar) {
    console.log("Simulación: no se ha escrito nada. Usa --aplicar para guardar los cambios.");
} else if (cambios.length > 0) {
    // El filtro incluye el correo leído: si cambió entretanto, esa fila no se toca
    const resultado = await db.collection("Usuarios").bulkWrite(cambios.map((u) => ({
        updateOne: { filter: { _id: u._id, correo: u.correo }, update: { $set: { correo: normalizarCorreo(u.correo) } } }
    })));
    console.log(`Correos modificados: ${resultado.modifiedCount}`);
}

await client.close();
