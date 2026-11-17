import { ObjectId } from "mongodb";
import { db } from "../db/connection.js";

// Regla única del correo: sin espacios en los extremos y en minúsculas. Se aplica al guardar y al buscar,
// de modo que el índice único de Usuarios.correo no distingue mayúsculas
export const normalizarCorreo = (correo) => String(correo ?? "").trim().toLowerCase();

// Campo ("correo" o "usuario") que ha violado un índice único al insertar o actualizar; null si el error es otro
export const campoDuplicado = (error) => {
    if (error?.code !== 11000) return null;
    return ["correo", "usuario"].find((campo) => error.keyPattern && campo in error.keyPattern) ?? null;
};

// Lo mínimo para comprobar una sesión: existencia de la cuenta y fecha del último cambio de contraseña
export const getSesionUsuario = async (id) => {
    return await db.collection("Usuarios").findOne({ _id: new ObjectId(id) }, { projection: { passwordChangedAt: 1 } });
};

export const getAllUsers = async () => {
    return await db.collection("Usuarios").find().toArray();
};

export const createUser = async (userData) => {
    return await db.collection("Usuarios").insertOne({ ...userData, correo: normalizarCorreo(userData.correo) });
};

// Obtener usuario por ID
export const getUserById = async (id) => {
    return await db.collection("Usuarios").findOne({ _id: new ObjectId(id) });
};

// Obtener usuario por correo
export const getUserByEmail = async (correo) => {
    return await db.collection("Usuarios").findOne({ correo: normalizarCorreo(correo) });
};

// Id del cliente con ese correo (ya normalizado), o null. Solo rol cliente: una cita nunca se asigna a un barbero
// o a un dueño. Solo se proyecta el _id: antes de crear la cita no se devuelve ningún dato de la cuenta
export const getClienteIdPorCorreo = async (correo) => {
    const cliente = await db.collection("Usuarios").findOne(
        { correo: normalizarCorreo(correo), rol: "cliente" },
        { projection: { _id: 1 } }
    );
    return cliente?._id ?? null;
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

// Un barbero desactivado conserva su cuenta, su agenda y su historial, pero no recibe citas nuevas.
// Los documentos sin el campo cuentan como activos
export const barberoActivo = (barbero) => barbero?.activo !== false;

// Activa o desactiva a un barbero; devuelve el barbero actualizado o null si no existe
export const setBarberoActivo = async (barberoId, activo) => {
    return await db.collection("Usuarios").findOneAndUpdate(
        { _id: new ObjectId(barberoId), rol: "barbero" },
        { $set: { activo, updatedAt: new Date() } },
        { returnDocument: "after", projection: { activo: 1 } }
    );
};

// Vuelve a ofrecer un servicio que el barbero tenía bloqueado; devuelve el barbero actualizado o null si no lo tenía
export const quitarServicioBloqueado = async (barberoId, servicioId) => {
    return await db.collection("Usuarios").findOneAndUpdate(
        { _id: new ObjectId(barberoId), serviciosBloqueados: servicioId },
        { $pull: { serviciosBloqueados: servicioId }, $set: { updatedAt: new Date() } },
        { returnDocument: "after", projection: { serviciosBloqueados: 1 } }
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

// Actualizar contraseña. passwordChangedAt invalida los tokens anteriores en las rutas de escritura
export const updateUserPassword = async (id, hashedPassword) => {
    const ahora = new Date();
    return await db.collection("Usuarios").updateOne(
        { _id: new ObjectId(id) },
        { $set: { pw: hashedPassword, passwordChangedAt: ahora, updatedAt: ahora } }
    );
};