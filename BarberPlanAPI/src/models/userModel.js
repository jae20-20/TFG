import { ObjectId } from "mongodb";
import { client } from "../db/connection.js";

const db = client.db("BarberPlan");

export const getAllUsers = async () => {
    return await db.collection("Usuarios").find().toArray();
};

export const createUser = async (userData) => {
    return await db.collection("Usuarios").insertOne(userData);
};

// Obtener usuario por ID
export const getUserById = async (id) => {
    return await db.collection("Usuarios").findOne({ _id: new ObjectId(id) });
};

// Obtener usuario por correo
export const getUserByEmail = async (correo) => {
    return await db.collection("Usuarios").findOne({ correo });
};

// Obtener usuario por nombre de usuario
export const getUserByUsername = async (usuario) => {
    return await db.collection("Usuarios").findOne({ usuario });
};

// Actualizar usuario
export const updateUser = async (id, updatedData) => {
    return await db.collection("Usuarios").updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
    );
};

// Eliminar usuario
export const deleteUser = async (id) => {
    return await db.collection("Usuarios").deleteOne({ _id: new ObjectId(id) });
};

// *-*-*-*-*-*FUNCIONES POR ROL*-*-*-*-*-*-*-*-*-*-*-*-*-

// Obtener usuarios por rol
export const getUsersByRole = async (rol) => {
    return await db.collection("Usuarios").find({ rol }).project({ pw: 0 }).toArray();
};

// Obtener todos los usuarios vinculados a una barbería (sin contraseña)
export const getUsersByBarberiaId = async (barberiaId) => {
    return await db.collection("Usuarios").find({
        barberiaId: new ObjectId(barberiaId)
    }).project({ pw: 0 }).toArray();
};

// Obtener barberos de una barbería específica
export const getBarberosByBarberia = async (barberiaId) => {
    return await db.collection("Usuarios").find({
        rol: "barbero",
        barberiaId: new ObjectId(barberiaId)
    }).project({ pw: 0 }).toArray();
};

// *-*-*- FUNCIONES DE PERFIL -*-*-*-

// Actualizar perfil (solo campos permitidos)
export const updateUserProfile = async (id, profileData) => {
    const allowedFields = ["nombre", "apellido", "usuario", "telefono", "avatar", "ciudad"];
    const filteredData = {};
    
    for (const key of allowedFields) {
        if (profileData[key] !== undefined) {
            filteredData[key] = profileData[key];
        }
    }
    
    filteredData.updatedAt = new Date();
    
    return await db.collection("Usuarios").updateOne(
        { _id: new ObjectId(id) },
        { $set: filteredData }
    );
};

// Actualizar contraseña
export const updateUserPassword = async (id, hashedPassword) => {
    return await db.collection("Usuarios").updateOne(
        { _id: new ObjectId(id) },
        { $set: { pw: hashedPassword, updatedAt: new Date() } }
    );
};