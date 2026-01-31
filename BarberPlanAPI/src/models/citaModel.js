//consultas a la bdd - Citas
import { ObjectId } from "mongodb";
import { client } from "../db/connection.js";

const db = client.db("BarberPlan");

// ==================== FUNCIONES BÁSICAS ====================

// Crear una nueva cita
export const createCita = async (citaData) => {
    const cita = {
        ...citaData,
        clienteId: new ObjectId(citaData.clienteId),
        barberoId: new ObjectId(citaData.barberoId),
        barberiaId: new ObjectId(citaData.barberiaId),
        servicioId: new ObjectId(citaData.servicioId),
        estado: "pendiente", // pendiente, confirmada, completada, cancelada
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
                "barbero.pw": 0
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
                "cliente.pw": 0
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
                "barbero.pw": 0
            }
        },
        { $sort: { fecha: -1 } }
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
