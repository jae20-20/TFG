// Eliminación de cuentas (RGPD, derecho de supresión). Cada función borra o anonimiza todo lo que
// depende de la cuenta dentro de una transacción: o se hace entero o no se toca nada.
import { ObjectId } from "mongodb";
import { client, db } from "../db/connection.js";

export const MOTIVO_BARBERIA_ELIMINADA = "barberia_eliminada";
export const NOMBRE_CLIENTE_ELIMINADO = "Cliente eliminado";

// Citas todavía por empezar que se cancelan al eliminar una cuenta. Las que ya empezaron no se tocan:
// el servicio ya se prestó (o no) y se cierran solas con las tareas periódicas
const filtroFuturas = (fecha, hora) => ({
    estado: { $in: ["pendiente", "confirmada"] },
    $or: [
        { fecha: { $gt: fecha } },
        { fecha, horaInicio: { $gt: hora } }
    ]
});

// Rango de _id de AgendaBloqueos de un barbero ("<barberoId>:<fecha>"): ';' es el carácter siguiente a ':'
const bloqueosDe = (barberoId) => ({ _id: { $gte: `${barberoId}:`, $lt: `${barberoId};` } });

const enTransaccion = async (trabajo) => {
    const session = client.startSession();
    try {
        let resultado;
        await session.withTransaction(async () => {
            resultado = await trabajo(session);
        });
        return resultado;
    } finally {
        await session.endSession();
    }
};

// Cliente: cancela sus citas futuras (el hueco queda libre porque cancelada no lo ocupa), anonimiza el resto
// (la barbería conserva su registro de servicios y cobros) y de las reseñas solo queda la puntuación. La respuesta
// de la barbería también se borra: iba dirigida a esa persona y puede nombrarla
export const eliminarCuentaCliente = async (clienteId, ahora, { fecha, hora }) => {
    const id = new ObjectId(clienteId);
    return await enTransaccion(async (session) => {
        const citas = db.collection("Citas");
        const canceladas = await citas.updateMany(
            { clienteId: id, ...filtroFuturas(fecha, hora) },
            { $set: { estado: "cancelada", motivoCancelacion: "cliente", updatedAt: ahora } },
            { session }
        );
        await citas.updateMany(
            { clienteId: id, resena: { $exists: true } },
            { $set: { "resena.comentario": "", "resena.imagen": null }, $unset: { "resena.respuesta": "" } },
            { session }
        );
        await citas.updateMany(
            { clienteId: id },
            { $set: { clienteId: null, clienteNombre: NOMBRE_CLIENTE_ELIMINADO, updatedAt: ahora }, $unset: { comentario: "", avisoCliente: "" } },
            { session }
        );
        await db.collection("Usuarios").deleteOne({ _id: id }, { session });
        return { citasCanceladas: canceladas.modifiedCount };
    });
};

// Cancela las citas futuras de un filtro y avisa a sus clientes de que fue la barbería
const cancelarFuturasConAviso = (citas, filtro, motivo, ahora, session) => citas.updateMany(
    filtro,
    { $set: { estado: "cancelada", motivoCancelacion: motivo, avisoCliente: { tipo: "cancelada", creadoEn: ahora }, updatedAt: ahora } },
    { session }
);

// Quita a un barbero de su barbería y de todo lo que lo referencia (sin borrar su usuario)
const retirarBarbero = async (barberoId, ahora, momento, session) => {
    const citas = db.collection("Citas");
    const canceladas = await cancelarFuturasConAviso(
        citas, { barberoId, ...filtroFuturas(momento.fecha, momento.hora) }, "barberia", ahora, session
    );
    await db.collection("Barberias").updateMany({ barberos: barberoId }, { $pull: { barberos: barberoId } }, { session });
    await db.collection("Solicitudes").deleteMany({ barberoId }, { session });
    // La invitación usada guarda nombre y apellido del invitado: se borra con su cuenta
    await db.collection("Invitaciones").deleteMany({ usadaPor: barberoId }, { session });
    await db.collection("AgendaBloqueos").deleteMany(bloqueosDe(barberoId.toString()), { session });
    return canceladas.modifiedCount;
};

// Barbero: cancela sus citas futuras avisando al cliente; las pasadas se conservan en el historial del cliente
export const eliminarCuentaBarbero = async (barberoId, ahora, momento) => {
    const id = new ObjectId(barberoId);
    return await enTransaccion(async (session) => {
        const citasCanceladas = await retirarBarbero(id, ahora, momento, session);
        await db.collection("Usuarios").deleteOne({ _id: id }, { session });
        return { citasCanceladas };
    });
};

// Dueño: elimina la barbería con todo lo suyo. Los barberos conservan su cuenta, sin barbería.
// Las citas pasadas se quedan en el historial de los clientes con una copia del nombre de la barbería
export const eliminarCuentaAdmin = async (adminId, barberia, ahora, momento) => {
    const id = new ObjectId(adminId);
    const barberiaId = barberia._id;
    return await enTransaccion(async (session) => {
        const citas = db.collection("Citas");
        const canceladas = await cancelarFuturasConAviso(
            citas, { barberiaId, ...filtroFuturas(momento.fecha, momento.hora) }, MOTIVO_BARBERIA_ELIMINADA, ahora, session
        );
        await citas.updateMany({ barberiaId }, { $set: { barberiaNombre: barberia.nombre } }, { session });

        const agenda = db.collection("AgendaBloqueos");
        for (const barberoId of [...(barberia.barberos || []), id]) {
            await agenda.deleteMany(bloqueosDe(barberoId.toString()), { session });
        }

        await db.collection("Usuarios").updateMany(
            { barberiaId, rol: "barbero" },
            { $set: { barberiaId: null, updatedAt: ahora } },
            { session }
        );
        await db.collection("Invitaciones").deleteMany({ barberiaId }, { session });
        await db.collection("Solicitudes").deleteMany({ barberiaId }, { session });
        await db.collection("Barberias").deleteOne({ _id: barberiaId }, { session });
        await db.collection("Usuarios").deleteOne({ _id: id }, { session });
        return { citasCanceladas: canceladas.modifiedCount };
    });
};

// Resumen de lo que borraría eliminar la barbería de un dueño (para el aviso de la app)
export const resumenBarberiaDelDuenio = async (barberia, momento) => {
    const [citasFuturas, barberos] = await Promise.all([
        db.collection("Citas").countDocuments({ barberiaId: barberia._id, ...filtroFuturas(momento.fecha, momento.hora) }),
        db.collection("Usuarios").countDocuments({ barberiaId: barberia._id, rol: "barbero" })
    ]);
    return { barberiaNombre: barberia.nombre, citasFuturas, barberos };
};
