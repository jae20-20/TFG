import { registrarError } from "../utils/registrarError.js";
import { db } from "./connection.js";

// Índices de la base de datos. Cada uno responde a una restricción de unicidad o a una consulta real.
// Los nombres son explícitos para que createIndex sea idempotente: si ya existe igual, no hace nada.
export const INDICES = [
  // Restricciones de unicidad: sin ellas dos peticiones simultáneas podrían crear el mismo correo o usuario
  { coleccion: "Usuarios", clave: { correo: 1 }, opciones: { name: "correo_unico", unique: true } },
  { coleccion: "Usuarios", clave: { usuario: 1 }, opciones: { name: "usuario_unico", unique: true } },
  { coleccion: "Invitaciones", clave: { codigoHash: 1 }, opciones: { name: "codigoHash_unico", unique: true } },

  // Consultas: equipo de la barbería, comprobaciones de admin, huecos del barbero y agendas
  { coleccion: "Usuarios", clave: { barberiaId: 1 }, opciones: { name: "barberiaId" } },
  { coleccion: "Barberias", clave: { adminId: 1 }, opciones: { name: "adminId" } },
  { coleccion: "Citas", clave: { barberoId: 1, fecha: 1 }, opciones: { name: "barberoId_fecha" } },
  { coleccion: "Citas", clave: { barberiaId: 1, fecha: 1 }, opciones: { name: "barberiaId_fecha" } },
  { coleccion: "Citas", clave: { clienteId: 1, fecha: -1 }, opciones: { name: "clienteId_fecha" } }
];

// Crea los índices que falten. Si falla uno único se lanza el error (el servidor no debe arrancar sin la
// garantía de unicidad); si falla uno de rendimiento solo se registra y se sigue.
export const crearIndices = async () => {
  const erroresUnicos = [];

  for (const { coleccion, clave, opciones } of INDICES) {
    try {
      await db.collection(coleccion).createIndex(clave, opciones);
    } catch (error) {
      registrarError(`No se pudo crear el índice ${coleccion}.${opciones.name}`, error);
      if (opciones.unique) erroresUnicos.push(`${coleccion}.${opciones.name}`);
    }
  }

  if (erroresUnicos.length > 0) {
    throw new Error(`Faltan índices únicos: ${erroresUnicos.join(", ")}`);
  }
};
