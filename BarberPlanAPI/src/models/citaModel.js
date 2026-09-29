//consultas a la bdd - Citas
import { ObjectId } from "mongodb";
import { client } from "../db/connection.js";

const db = client.db("BarberPlan");

// ==================== FUNCIONES BÁSICAS ====================

// Crear una nueva cita
export const createCita = async (citaData) => {
    const cita = {
        ...citaData,
        clienteId: citaData.clienteId ? new ObjectId(citaData.clienteId) : null,
        barberoId: new ObjectId(citaData.barberoId),
        barberiaId: new ObjectId(citaData.barberiaId),
        servicioId: new ObjectId(citaData.servicioId),
        estado: citaData.estado || "pendiente", // pendiente, confirmada, completada, cancelada
        pagado: citaData.pagado !== undefined ? Boolean(citaData.pagado) : false,
        importePagado: citaData.importePagado !== undefined ? Number(citaData.importePagado) : (Number(citaData.servicioPrecio) || 0),
        createdAt: new Date(),
        updatedAt: new Date()
    };
    return await db.collection("Citas").insertOne(cita);
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

// Guardar la reseña de una cita (una única vez, por el cliente dueño)
export const setResenaCita = async (id, resena) => {
    return await db.collection("Citas").updateOne(
        { _id: new ObjectId(id) },
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

// Cambiar estado de una cita
export const updateCitaEstado = async (id, estado) => {
    const estadosValidos = ["pendiente", "confirmada", "completada", "cancelada"];
    if (!estadosValidos.includes(estado)) {
        throw new Error("Estado no válido");
    }
    return await db.collection("Citas").updateOne(
        { _id: new ObjectId(id) },
        { $set: { estado, updatedAt: new Date() } }
    );
};

// Cambiar estado de pago e importe de una cita
export const updateCitaPago = async (id, pagado, importePagado) => {
    return await db.collection("Citas").updateOne(
        { _id: new ObjectId(id) },
        { $set: { pagado: Boolean(pagado), importePagado: Number(importePagado), updatedAt: new Date() } }
    );
};

// ==================== FUNCIONES DE DISPONIBILIDAD ====================

// Verificar disponibilidad de un barbero en una fecha/hora
export const checkBarberoDisponibilidad = async (barberoId, fecha, horaInicio, horaFin) => {
    const citasConflicto = await db.collection("Citas").find({
        barberoId: new ObjectId(barberoId),
        fecha: fecha,
        estado: { $in: ["pendiente", "confirmada"] },
        $or: [
            { horaInicio: { $lt: horaFin, $gte: horaInicio } },
            { horaFin: { $gt: horaInicio, $lte: horaFin } },
            { horaInicio: { $lte: horaInicio }, horaFin: { $gte: horaFin } }
        ]
    }).toArray();
    
    return citasConflicto.length === 0; // true si está disponible
};

// Obtener citas de un barbero en una fecha específica
export const getCitasByBarberoAndFecha = async (barberoId, fecha) => {
    return await db.collection("Citas").find({
        barberoId: new ObjectId(barberoId),
        fecha: fecha,
        estado: { $in: ["pendiente", "confirmada"] }
    }).sort({ horaInicio: 1 }).toArray();
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
                servicioId: 1, servicioNombre: 1, servicioPrecio: 1, pagado: 1, importePagado: 1
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
                estado: { $ne: "cancelada" },
                fecha: { $lt: antesDe }
            }
        },
        { $group: { _id: "$clienteId" } }
    ]).toArray();
    return grupos.map(g => g._id.toString());
};
