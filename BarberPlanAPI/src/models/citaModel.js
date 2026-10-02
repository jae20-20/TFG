//consultas a la bdd - Citas
import { ObjectId } from "mongodb";
import { client, db } from "../db/connection.js";

// Estados que mantienen el hueco del barbero ocupado
export const ESTADOS_OCUPAN_HUECO = ["pendiente", "confirmada"];

// ==================== FUNCIONES BÁSICAS ====================

// Crea la cita solo si el barbero no tiene otra pendiente o confirmada que se solape.
// Devuelve la cita insertada o null si el hueco ya estaba ocupado.
export const createCita = async (citaData) => {
    const cita = {
        ...citaData,
        clienteId: citaData.clienteId ? new ObjectId(citaData.clienteId) : null,
        barberoId: new ObjectId(citaData.barberoId),
        barberiaId: new ObjectId(citaData.barberiaId),
        servicioId: new ObjectId(citaData.servicioId),
        pagado: citaData.pagado !== undefined ? Boolean(citaData.pagado) : false,
        importePagado: citaData.importePagado !== undefined ? Number(citaData.importePagado) : (Number(citaData.servicioPrecio) || 0),
        createdAt: new Date(),
        updatedAt: new Date()
    };

    // Dos reservas simultáneas escriben el mismo bloqueo (barbero + día): MongoDB aborta una y withTransaction la reintenta viendo ya la otra
    const agenda = db.collection("AgendaBloqueos");
    const bloqueoId = `${cita.barberoId}:${cita.fecha}`;
    try {
        await agenda.updateOne({ _id: bloqueoId }, { $setOnInsert: { version: 0 } }, { upsert: true });
    } catch (error) {
        if (error.code !== 11000) throw error;
    }

    const session = client.startSession();
    try {
        let insertada = null;
        await session.withTransaction(async () => {
            insertada = null;
            await agenda.updateOne({ _id: bloqueoId }, { $inc: { version: 1 } }, { session });
            const solape = await db.collection("Citas").findOne({
                barberoId: cita.barberoId,
                fecha: cita.fecha,
                estado: { $in: ESTADOS_OCUPAN_HUECO },
                horaInicio: { $lt: cita.horaFin },
                horaFin: { $gt: cita.horaInicio }
            }, { session, projection: { _id: 1 } });
            if (solape) return;
            const { insertedId } = await db.collection("Citas").insertOne({ ...cita }, { session });
            insertada = { ...cita, _id: insertedId };
        });
        return insertada;
    } finally {
        await session.endSession();
    }
};

// Obtener cita por ID
export const getCitaById = async (id) => {
    return await db.collection("Citas").findOne({ _id: new ObjectId(id) });
};

// Actualizar cita
export const updateCita = async (id, updatedData) => {
    return await db.collection("Citas").updateOne(
        { _id: new ObjectId(id) },
        { $set: { ...updatedData, updatedAt: new Date() } }
    );
};

// Eliminar cita
export const deleteCita = async (id) => {
    return await db.collection("Citas").deleteOne({ _id: new ObjectId(id) });
};

// ==================== FUNCIONES POR USUARIO ====================

// Obtener citas de un cliente
export const getCitasByClienteId = async (clienteId) => {
    return await db.collection("Citas").aggregate([
        { $match: { clienteId: new ObjectId(clienteId) } },
        {
            $lookup: {
                from: "Barberias",
                localField: "barberiaId",
                foreignField: "_id",
                as: "barberia"
            }
        },
        {
            $lookup: {
                from: "Usuarios",
                localField: "barberoId",
                foreignField: "_id",
                as: "barbero"
            }
        },
        { $unwind: { path: "$barberia", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$barbero", preserveNullAndEmptyArrays: true } },
        {
            $project: {
                "barbero.pw": 0,
                "resena.imagen": 0
            }
        },
        { $sort: { fecha: -1 } }
    ]).toArray();
};

// Obtener citas de un barbero
export const getCitasByBarberoId = async (barberoId) => {
    return await db.collection("Citas").aggregate([
        { $match: { barberoId: new ObjectId(barberoId) } },
        {
            $lookup: {
                from: "Usuarios",
                localField: "clienteId",
                foreignField: "_id",
                as: "cliente"
            }
        },
        { $unwind: { path: "$cliente", preserveNullAndEmptyArrays: true } },
        {
            $project: {
                "cliente.pw": 0,
                "resena.imagen": 0
            }
        },
        { $sort: { fecha: -1 } }
    ]).toArray();
};

// ==================== FUNCIONES POR BARBERÍA ====================

// Obtener todas las citas de una barbería
export const getCitasByBarberiaId = async (barberiaId) => {
    return await db.collection("Citas").aggregate([
        { $match: { barberiaId: new ObjectId(barberiaId) } },
        {
            $lookup: {
                from: "Usuarios",
                localField: "clienteId",
                foreignField: "_id",
                as: "cliente"
            }
        },
        {
            $lookup: {
                from: "Usuarios",
                localField: "barberoId",
                foreignField: "_id",
                as: "barbero"
            }
        },
        { $unwind: { path: "$cliente", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$barbero", preserveNullAndEmptyArrays: true } },
        {
            $project: {
                "cliente.pw": 0,
                "barbero.pw": 0,
                "resena.imagen": 0
            }
        },
        { $sort: { fecha: -1 } }
    ]).toArray();
};

// ==================== FUNCIONES DE RESEÑAS ====================

// Guardar la reseña de una cita completada; el filtro impide una segunda reseña aunque lleguen a la vez
export const setResenaCita = async (id, resena) => {
    return await db.collection("Citas").updateOne(
        { _id: new ObjectId(id), estado: "completada", resena: { $exists: false } },
        { $set: { resena, updatedAt: new Date() } }
    );
};

// Obtener las reseñas de una barbería, con datos del cliente, barbero y cita
export const getResenasByBarberiaId = async (barberiaId) => {
    return await db.collection("Citas").aggregate([
        { $match: { barberiaId: new ObjectId(barberiaId), resena: { $exists: true } } },
        {
            $lookup: {
                from: "Usuarios",
                localField: "clienteId",
                foreignField: "_id",
                as: "cliente"
            }
        },
        {
            $lookup: {
                from: "Usuarios",
                localField: "barberoId",
                foreignField: "_id",
                as: "barbero"
            }
        },
        { $unwind: { path: "$cliente", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$barbero", preserveNullAndEmptyArrays: true } },
        {
            $project: {
                fecha: 1,
                horaInicio: 1,
                servicioNombre: 1,
                servicioPrecio: 1,
                resena: 1,
                "cliente.nombre": 1,
                "cliente.apellido": 1,
                "cliente.avatar": 1,
                "barbero.nombre": 1,
                "barbero.apellido": 1
            }
        },
        { $sort: { "resena.createdAt": -1 } }
    ]).toArray();
};

// ==================== FUNCIONES DE ESTADO ====================

// Cambia el estado solo si la cita sigue en un estado de origen; null si otra petición se adelantó
export const transicionarCita = async (id, estadosOrigen, estadoDestino, campos = {}) => {
    return await db.collection("Citas").findOneAndUpdate(
        { _id: new ObjectId(id), estado: { $in: estadosOrigen } },
        { $set: { ...campos, estado: estadoDestino, updatedAt: new Date() } },
        { returnDocument: "after" }
    );
};

// Cambiar estado de pago e importe de una cita (solo confirmadas o completadas).
// completar: el cobro completa la cita y lo deja marcado; revertir: deshace solo esa completación
export const updateCitaPago = async (id, pagado, importePagado, { completar = false, revertir = false } = {}) => {
    const filtro = { _id: new ObjectId(id), estado: { $in: ["confirmada", "completada"] } };
    const cambios = { $set: { pagado: Boolean(pagado), importePagado: Number(importePagado), updatedAt: new Date() } };
    if (completar) {
        filtro.estado = "confirmada";
        Object.assign(cambios.$set, { estado: "completada", completadaPorPago: true });
    }
    if (revertir) {
        Object.assign(filtro, { estado: "completada", completadaPorPago: true, resena: { $exists: false } });
        cambios.$set.estado = "confirmada";
        cambios.$unset = { completadaPorPago: "" };
    }
    return await db.collection("Citas").updateOne(filtro, cambios);
};

// ==================== FUNCIONES DE DISPONIBILIDAD ====================

// Obtener citas de un barbero en una fecha específica
export const getCitasByBarberoAndFecha = async (barberoId, fecha) => {
    return await db.collection("Citas").find({
        barberoId: new ObjectId(barberoId),
        fecha: fecha,
        estado: { $in: ESTADOS_OCUPAN_HUECO }
    }).sort({ horaInicio: 1 }).toArray();
};

// ==================== TAREAS PROGRAMADAS ====================

// Caduca las pendientes con plazo vencido u hora ya llegada; sin expiraEn son "pendiente" antiguas y no caducan
export const cancelarPendientesVencidas = async (ahora, fechaActual, horaActual) => {
    return await db.collection("Citas").updateMany(
        {
            estado: "pendiente",
            expiraEn: { $exists: true },
            $or: [
                { expiraEn: { $lte: ahora } },
                { fecha: { $lt: fechaActual } },
                { fecha: fechaActual, horaInicio: { $lte: horaActual } }
            ]
        },
        { $set: { estado: "cancelada", motivoCancelacion: "expirada", updatedAt: ahora } }
    );
};

// Da por completadas las citas confirmadas que terminaron antes del límite sin que nadie registrara la asistencia
export const completarAsistenciasSinRegistrar = async (fechaLimite, horaLimite) => {
    return await db.collection("Citas").updateMany(
        {
            estado: "confirmada",
            $or: [
                { fecha: { $lt: fechaLimite } },
                { fecha: fechaLimite, horaFin: { $lte: horaLimite } }
            ]
        },
        { $set: { estado: "completada", asistenciaAutomatica: true, updatedAt: new Date() } }
    );
};

// ==================== ANALÍTICAS ====================

// Citas de una barbería entre dos fechas (YYYY-MM-DD, ambas incluidas) con el nombre del cliente
export const getCitasBarberiaEnRango = async (barberiaId, desde, hasta) => {
    return await db.collection("Citas").aggregate([
        { $match: { barberiaId: new ObjectId(barberiaId), fecha: { $gte: desde, $lte: hasta } } },
        {
            $lookup: {
                from: "Usuarios",
                localField: "clienteId",
                foreignField: "_id",
                as: "cliente",
                pipeline: [{ $project: { nombre: 1, apellido: 1 } }]
            }
        },
        { $unwind: { path: "$cliente", preserveNullAndEmptyArrays: true } },
        {
            $project: {
                barberoId: 1, clienteId: 1, clienteNombre: 1, cliente: 1, estado: 1, fecha: 1, horaInicio: 1,
                servicioId: 1, servicioNombre: 1, servicioPrecio: 1, servicios: 1, pagado: 1, importePagado: 1
            }
        }
    ]).toArray();
};

// De una lista de clientes, cuáles ya tenían alguna cita no cancelada en la barbería antes de una fecha
export const getClientesConCitasAnteriores = async (barberiaId, clienteIds, antesDe) => {
    if (clienteIds.length === 0) return [];
    const grupos = await db.collection("Citas").aggregate([
        {
            $match: {
                barberiaId: new ObjectId(barberiaId),
                clienteId: { $in: clienteIds },
                estado: { $in: ["confirmada", "completada"] },
                fecha: { $lt: antesDe }
            }
        },
        { $group: { _id: "$clienteId" } }
    ]).toArray();
    return grupos.map(g => g._id.toString());
};
