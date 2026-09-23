//consultas a la bdd - Barberías
import { ObjectId } from "mongodb";
import { client } from "../db/connection.js";

const db = client.db("BarberPlan");

export const getDefaultBarberiaSchedule = () => ({
    timezone: "Europe/Madrid",
    weeklyTemplate: {
        mon: [],
        tue: [],
        wed: [],
        thu: [],
        fri: [],
        sat: [],
        sun: []
    },
    exceptions: []
});

// ==================== FUNCIONES BÁSICAS ====================

export const getAllBarbershops = async () => {
    return await db.collection("Barberias").find().toArray();
};

export const createBarbershop = async (barbershopData) => {
    return await db.collection("Barberias").insertOne(barbershopData);
};

// Obtener barbería por ID
export const getBarbershopById = async (id) => {
    return await db.collection("Barberias").findOne({ _id: new ObjectId(id) });
};

// Actualizar barbería
export const updateBarbershop = async (id, updatedData) => {
    return await db.collection("Barberias").updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
    );
};

// Eliminar barbería
export const deleteBarbershop = async (id) => {
    return await db.collection("Barberias").deleteOne({ _id: new ObjectId(id) });
};

// ==================== FUNCIONES DE ADMIN ====================

// Obtener barbería por ID del administrador
export const getBarberiaByAdminId = async (adminId) => {
    return await db.collection("Barberias").findOne({ adminId: new ObjectId(adminId) });
};

// Verificar si el usuario es admin de la barbería
export const isUserAdminOfBarberia = async (userId, barberiaId) => {
    const barberia = await db.collection("Barberias").findOne({
        _id: new ObjectId(barberiaId),
        adminId: new ObjectId(userId)
    });
    return !!barberia;
};

// ==================== FUNCIONES DE BARBEROS ====================

// Añadir barbero a la barbería
export const addBarberoToBarberia = async (barberiaId, barberoId) => {
    return await db.collection("Barberias").updateOne(
        { _id: new ObjectId(barberiaId) },
        { $addToSet: { barberos: new ObjectId(barberoId) } }
    );
};

// Eliminar barbero de la barbería
export const removeBarberoFromBarberia = async (barberiaId, barberoId) => {
    return await db.collection("Barberias").updateOne(
        { _id: new ObjectId(barberiaId) },
        { $pull: { barberos: new ObjectId(barberoId) } }
    );
};

// Obtener todos los barberos de una barbería (incluyendo al admin)
export const getBarberosByBarberiaId = async (barberiaId) => {
    const barberia = await db.collection("Barberias").findOne({ _id: new ObjectId(barberiaId) });
    if (!barberia) return [];
    
    // Incluir a los empleados y al admin
    const barberosIds = barberia.barberos || [];
    if (barberia.adminId && !barberosIds.some(id => id.toString() === barberia.adminId.toString())) {
        barberosIds.push(barberia.adminId);
    }

    if (barberosIds.length === 0) return [];
    
    return await db.collection("Usuarios").find({
        _id: { $in: barberosIds }
    }).project({ pw: 0 }).toArray(); // Excluir contraseña
};

// ==================== FUNCIONES DE SERVICIOS ====================

// Añadir servicio a la barbería
export const addServicioToBarberia = async (barberiaId, servicio) => {
    const servicioConId = {
        _id: new ObjectId(),
        ...servicio,
        createdAt: new Date()
    };
    await db.collection("Barberias").updateOne(
        { _id: new ObjectId(barberiaId) },
        { $push: { servicios: servicioConId } }
    );
    return servicioConId;
};

// Actualizar servicio de la barbería
export const updateServicioInBarberia = async (barberiaId, servicioId, updatedData) => {
    return await db.collection("Barberias").updateOne(
        { 
            _id: new ObjectId(barberiaId),
            "servicios._id": new ObjectId(servicioId)
        },
        { 
            $set: {
                "servicios.$.nombre": updatedData.nombre,
                "servicios.$.descripcion": updatedData.descripcion,
                "servicios.$.precio": updatedData.precio,
                "servicios.$.duracion": updatedData.duracion,
                "servicios.$.updatedAt": new Date()
            }
        }
    );
};

// Eliminar servicio de la barbería
export const removeServicioFromBarberia = async (barberiaId, servicioId) => {
    return await db.collection("Barberias").updateOne(
        { _id: new ObjectId(barberiaId) },
        { $pull: { servicios: { _id: new ObjectId(servicioId) } } }
    );
};

// Obtener todos los servicios de una barbería
export const getServiciosByBarberiaId = async (barberiaId) => {
    const barberia = await db.collection("Barberias").findOne({ _id: new ObjectId(barberiaId) });
    return barberia?.servicios || [];
};

// Obtener un servicio específico
export const getServicioById = async (barberiaId, servicioId) => {
    const barberia = await db.collection("Barberias").findOne(
        { _id: new ObjectId(barberiaId) },
        { projection: { servicios: { $elemMatch: { _id: new ObjectId(servicioId) } } } }
    );
    return barberia?.servicios?.[0] || null;
};