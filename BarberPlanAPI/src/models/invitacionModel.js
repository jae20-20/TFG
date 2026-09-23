//consultas a la bdd - Invitaciones de empleados
import crypto from "crypto";
import { ObjectId } from "mongodb";
import { client } from "../db/connection.js";

const db = client.db("BarberPlan");

// Días que una invitación permanece válida sin usarse
export const INVITACION_DIAS_VALIDEZ = 7;

// Alfabeto sin caracteres ambiguos (se excluyen O, 0, I, 1) para que el código
// pueda dictarse o copiarse a mano sin errores.
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// ==================== CÓDIGOS ====================

// Genera un código aleatorio de un solo uso con formato XXXX-XXXX.
// Se usa crypto.randomBytes (no el timestamp, que sería adivinable por fuerza
// bruta) para conseguir entropía real: 8 caracteres sobre 32 símbolos = 40 bits.
export const generateInvitationCode = () => {
    const bytes = crypto.randomBytes(8);
    const chars = Array.from(bytes, (byte) => ALFABETO[byte % ALFABETO.length]);
    return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
};

// Normaliza lo que escribe el usuario (minúsculas, espacios, guion olvidado)
export const normalizeInvitationCode = (code) => {
    const limpio = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (limpio.length !== 8) return null;
    return `${limpio.slice(0, 4)}-${limpio.slice(4)}`;
};

// En la base de datos solo se guarda el hash: si alguien accediera a la BD no
// obtendría ningún código utilizable.
export const hashInvitationCode = (code) => {
    return crypto.createHash("sha256").update(code).digest("hex");
};

// ==================== CONSULTAS ====================

export const createInvitacion = async (invitacionData) => {
    return await db.collection("Invitaciones").insertOne(invitacionData);
};

export const getInvitacionById = async (id) => {
    return await db.collection("Invitaciones").findOne({ _id: new ObjectId(id) });
};

export const getInvitacionesByBarberia = async (barberiaId) => {
    return await db.collection("Invitaciones")
        .find({ barberiaId: new ObjectId(barberiaId) })
        .sort({ createdAt: -1 })
        .toArray();
};

// Busca una invitación utilizable a partir del hash del código
export const getInvitacionPendienteByHash = async (codigoHash) => {
    return await db.collection("Invitaciones").findOne({
        codigoHash,
        estado: "pendiente"
    });
};

// Marca la invitación como usada de forma atómica: el filtro exige que siga
// pendiente y no haya expirado, así dos registros simultáneos con el mismo
// código no pueden crear dos cuentas.
export const consumeInvitacion = async (codigoHash, usuarioId) => {
    const result = await db.collection("Invitaciones").findOneAndUpdate(
        {
            codigoHash,
            estado: "pendiente",
            expiresAt: { $gt: new Date() }
        },
        {
            $set: {
                estado: "usada",
                usadaPor: new ObjectId(usuarioId),
                usadaAt: new Date(),
                updatedAt: new Date()
            }
        },
        { returnDocument: "after" }
    );
    return result?.value || result || null;
};

// Sustituye el código de una invitación pendiente por uno nuevo
export const regenerarInvitacionCode = async (id, barberiaId, codigoHash, expiresAt) => {
    const result = await db.collection("Invitaciones").findOneAndUpdate(
        {
            _id: new ObjectId(id),
            barberiaId: new ObjectId(barberiaId),
            estado: "pendiente"
        },
        {
            $set: {
                codigoHash,
                expiresAt,
                updatedAt: new Date()
            }
        },
        { returnDocument: "after" }
    );
    return result?.value || result || null;
};

export const revocarInvitacion = async (id, barberiaId) => {
    return await db.collection("Invitaciones").updateOne(
        {
            _id: new ObjectId(id),
            barberiaId: new ObjectId(barberiaId),
            estado: "pendiente"
        },
        {
            $set: {
                estado: "revocada",
                updatedAt: new Date()
            }
        }
    );
};

export const deleteInvitacion = async (id, barberiaId) => {
    return await db.collection("Invitaciones").deleteOne({
        _id: new ObjectId(id),
        barberiaId: new ObjectId(barberiaId)
    });
};
