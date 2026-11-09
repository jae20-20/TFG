// Borra los datos que han creado los participantes de las pruebas, sin tocar lo que has creado tú.
//
//   npm run limpiar -- --bd=<base> --desde=<fecha> --conservar=<correo1,correo2,...> [--borrar]
//
//   --bd          nombre de la base de datos (obligatorio; p. ej. BarberPlan_prod)
//   --desde       fecha de inicio de las pruebas, YYYY-MM-DD (o con hora: 2026-11-20T09:00:00Z). Solo se consideran
//                 participantes las cuentas creadas desde ese momento
//   --conservar   correos de TUS cuentas (separados por comas): nunca se borran, y se conservan sus barberías
//   --borrar      borrado real. SIN esta opción solo simula: muestra qué borraría y no escribe nada
//
// La conexión va en la variable de entorno LIMPIEZA_ATLAS_URI (no en la línea de comandos, que queda en el historial).
//
// Cómo distingue lo tuyo de lo de los participantes:
//   · Participante = cuenta creada desde --desde cuyo correo NO está en --conservar. Las cuentas anteriores a esa fecha, o sin
//     fecha de creación, nunca se tocan.
//   · Se borran: las cuentas participantes; las barberías cuyo dueño es un participante (con sus invitaciones y solicitudes);
//     todas las citas en las que interviene un participante (como cliente o barbero) o que son de una barbería borrada
//     (incluidas las reseñas, que viven en la cita); las solicitudes de los participantes; las invitaciones usadas por ellos
//     y las que se crearon desde --desde en tus barberías (llevan el nombre del invitado); y la agenda de sus barberos.
//   · Se conservan: tus cuentas y tus barberías con sus servicios y horarios, y las citas que solo implican a cuentas tuyas.
//   · Tus barberos que trabajaban en una barbería de un participante quedan sin barbería (como al eliminar la barbería).
import { MongoClient } from "mongodb";

const argumentos = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const [clave, ...valor] = a.slice(2).split("=");
    return [clave, valor.length ? valor.join("=") : "true"];
}));
const salirConError = (mensaje) => { console.error(`Error: ${mensaje}`); process.exit(2); };

const nombreBD = argumentos.bd;
const uri = process.env.LIMPIEZA_ATLAS_URI;
const borrar = argumentos.borrar === "true";
if (!nombreBD || nombreBD === "true") salirConError("falta --bd=<nombre de la base de datos>");
if (!uri) salirConError("falta la variable de entorno LIMPIEZA_ATLAS_URI con la cadena de conexión");

const desde = new Date(argumentos.desde ?? "");
if (!argumentos.desde || Number.isNaN(desde.getTime())) salirConError("falta --desde=YYYY-MM-DD (fecha de inicio de las pruebas) o no es válida");
const conservar = new Set((argumentos.conservar && argumentos.conservar !== "true" ? argumentos.conservar.split(",") : []).map((c) => c.trim().toLowerCase()).filter(Boolean));
if (conservar.size === 0) salirConError("falta --conservar=<tus correos separados por comas>: sin esa lista no se sabría qué cuentas son tuyas");

const cliente = new MongoClient(uri);
await cliente.connect();
const bd = cliente.db(nombreBD);
const col = (nombre) => bd.collection(nombre);

try {
    // ---------------------------------------------------------------- Qué se borraría
    const recientes = await col("Usuarios").find({ createdAt: { $gte: desde } }, { projection: { correo: 1, rol: 1, createdAt: 1, barberiaId: 1 } }).toArray();
    const participantes = recientes.filter((u) => !conservar.has(String(u.correo).toLowerCase()));
    const propiasRecientes = recientes.filter((u) => conservar.has(String(u.correo).toLowerCase()));
    const sinEncontrar = [...conservar].filter((c) => !propiasRecientes.some((u) => u.correo === c));
    const idsParticipantes = participantes.map((u) => u._id);

    const barberiasABorrar = await col("Barberias").find({ adminId: { $in: idsParticipantes } }, { projection: { nombre: 1, barberos: 1, adminId: 1 } }).toArray();
    const idsBarberiasABorrar = barberiasABorrar.map((b) => b._id);

    const filtroCitas = { $or: [{ clienteId: { $in: idsParticipantes } }, { barberoId: { $in: idsParticipantes } }, { barberiaId: { $in: idsBarberiasABorrar } }] };
    const filtroSolicitudes = { $or: [{ barberoId: { $in: idsParticipantes } }, { barberiaId: { $in: idsBarberiasABorrar } }] };
    const filtroInvitaciones = {
        $or: [
            { barberiaId: { $in: idsBarberiasABorrar } },
            { usadaPor: { $in: idsParticipantes } },
            // Invitaciones de tus barberías creadas durante las pruebas: guardan nombre y apellido de los invitados
            { createdAt: { $gte: desde }, barberiaId: { $nin: idsBarberiasABorrar } }
        ]
    };

    // Cuentas tuyas que trabajaban en una barbería que se borra: quedarán sin barbería
    const empleadosPropios = await col("Usuarios").countDocuments({ barberiaId: { $in: idsBarberiasABorrar }, _id: { $nin: idsParticipantes } });
    // Agenda (bloqueos por barbero y día) de todos los barberos implicados: los participantes y los que trabajan en una barbería que se borra
    const idsConAgenda = [...new Set([
        ...idsParticipantes.map(String),
        ...barberiasABorrar.flatMap((b) => [b.adminId, ...(b.barberos ?? [])].map(String))
    ])];
    const filtroAgenda = { $or: idsConAgenda.map((id) => ({ _id: { $gte: `${id}:`, $lt: `${id};` } })) };

    const cuentas = {
        cuentas: idsParticipantes.length,
        barberias: idsBarberiasABorrar.length,
        citas: await col("Citas").countDocuments(filtroCitas),
        solicitudes: await col("Solicitudes").countDocuments(filtroSolicitudes),
        invitaciones: await col("Invitaciones").countDocuments(filtroInvitaciones),
        agenda: idsConAgenda.length ? await col("AgendaBloqueos").countDocuments(filtroAgenda) : 0
    };

    console.log(`${borrar ? "BORRADO REAL" : "SIMULACIÓN (no se borra nada)"} en la base «${nombreBD}»`);
    console.log(`Pruebas desde ${desde.toISOString()}. Cuentas tuyas que se conservan: ${[...conservar].join(", ")}`);
    if (sinEncontrar.length) console.log(`Aviso: estos correos de --conservar no corresponden a ninguna cuenta creada desde esa fecha (no pasa nada si son anteriores): ${sinEncontrar.join(", ")}`);
    console.log(`\nParticipantes (${participantes.length}):`);
    for (const u of participantes) console.log(`  ${String(u.rol).padEnd(8)} ${u.correo}  (creada ${u.createdAt.toISOString()})`);
    if (barberiasABorrar.length) console.log(`\nBarberías de participantes: ${barberiasABorrar.map((b) => b.nombre).join(", ")}`);
    if (empleadosPropios) console.log(`\nCuentas tuyas que quedarán sin barbería: ${empleadosPropios}`);
    console.log("\nSe borrarían:");
    for (const [clave, n] of Object.entries(cuentas)) console.log(`  ${clave.padEnd(13)} ${n}`);

    if (!borrar) {
        console.log("\nNo se ha borrado nada. Para borrar de verdad repite el mismo comando añadiendo --borrar");
    } else if (cuentas.cuentas === 0 && cuentas.citas === 0 && cuentas.invitaciones === 0) {
        console.log("\nNo hay nada que borrar.");
    } else {
        // Todo o nada: una transacción
        const sesion = cliente.startSession();
        try {
            await sesion.withTransaction(async () => {
                await col("Citas").deleteMany(filtroCitas, { session: sesion });
                await col("Solicitudes").deleteMany(filtroSolicitudes, { session: sesion });
                await col("Invitaciones").deleteMany(filtroInvitaciones, { session: sesion });
                if (idsConAgenda.length) await col("AgendaBloqueos").deleteMany(filtroAgenda, { session: sesion });
                // Tus empleados dejan la barbería que se borra; los participantes salen de las barberías que se conservan
                await col("Usuarios").updateMany({ barberiaId: { $in: idsBarberiasABorrar }, _id: { $nin: idsParticipantes } }, { $set: { barberiaId: null, updatedAt: new Date() } }, { session: sesion });
                await col("Barberias").updateMany({ _id: { $nin: idsBarberiasABorrar } }, { $pull: { barberos: { $in: idsParticipantes } } }, { session: sesion });
                await col("Barberias").deleteMany({ _id: { $in: idsBarberiasABorrar } }, { session: sesion });
                await col("Usuarios").deleteMany({ _id: { $in: idsParticipantes } }, { session: sesion });
            });
        } finally {
            await sesion.endSession();
        }
        console.log("\nBorrado completado.");
    }
} finally {
    await cliente.close();
}
