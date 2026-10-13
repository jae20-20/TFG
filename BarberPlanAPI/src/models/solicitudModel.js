import { ObjectId } from "mongodb";
import { db } from "../db/connection.js";

export const getAllSolicitudes = async () => {
    return await db.collection("Solicitudes").find().toArray();
};

export const createSolicitud = async (solicitudData) => {
    const solicitud = {
        ...solicitudData,
        estado: "pendiente",
        createdAt: new Date(),
        updatedAt: new Date()
    };
    return await db.collection("Solicitudes").insertOne(solicitud);
};

export const getSolicitudById = async (id) => {
    return await db.collection("Solicitudes").findOne({ _id: new ObjectId(id) });
};

export const getSolicitudesByBarbero = async (barberoId) => {
    return await db.collection("Solicitudes").find({ barberoId: new ObjectId(barberoId) }).sort({ createdAt: -1 }).toArray();
};

export const getSolicitudesByBarberia = async (barberiaId) => {
    return await db.collection("Solicitudes").find({ barberiaId: new ObjectId(barberiaId) }).sort({ createdAt: -1 }).toArray();
};

// Responde una solicitud solo si sigue pendiente; matchedCount 0 si otra petición ya la respondió
export const updateSolicitudEstado = async (id, estado, respuestaAdmin) => {
    return await db.collection("Solicitudes").updateOne(
        { _id: new ObjectId(id), estado: "pendiente" },
        { 
            $set: { 
                estado, 
                respuestaAdmin: respuestaAdmin || null,
                updatedAt: new Date() 
            } 
        }
    );
};

export const deleteSolicitud = async (id) => {
    return await db.collection("Solicitudes").deleteOne({ _id: new ObjectId(id) });
};
