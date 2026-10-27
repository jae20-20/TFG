//manejar http request - Barberías
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { MENSAJES_DUPLICADO, validarCorreo, validarPasswordNueva } from "../middleware/validateMiddleware.js";
import { ObjectId } from "mongodb";

import {
    addServicioToBarberia,
    createBarbershop,
    getAllBarbershops,
    getBarberiaByAdminId,
    getBarberosByBarberiaId,
    getBarbershopById,
    getDefaultBarberiaSchedule,
    getServicioById,
    getServiciosByBarberiaId,
    isUserAdminOfBarberia,
    removeBarberoFromBarberia,
    removeServicioFromBarberia,
    updateBarbershop,
    updateServicioInBarberia
} from "../models/barbershopModel.js";

import {
    consumeInvitacion,
    createInvitacion,
    deleteInvitacion,
    generateInvitationCode,
    getInvitacionesByBarberia,
    getInvitacionPendienteByHash,
    hashInvitationCode,
    INVITACION_DIAS_VALIDEZ,
    normalizeInvitationCode,
    regenerarInvitacionCode,
    revocarInvitacion
} from "../models/invitacionModel.js";

import { barberoActivo, campoDuplicado, createUser, getUserByEmail, getUserByUsername, getUserById, normalizarCorreo, setBarberoActivo } from "../models/userModel.js";
import { contarCitasFuturasBarbero, getResenasByBarberiaId } from "../models/citaModel.js";


// Obtener todas las barberías (público)
export const getBarberias = async (req, res) => {
    try {
        const barberias = await getAllBarbershops();
        // Excluir información sensible
        const barberiasPublicas = barberias.map(({ adminId, ...barberia }) => barberia);
        res.json(barberiasPublicas);
    } catch (error) {
        console.error("Error al obtener barberías:", error);
        res.status(500).json({ error: "Error al obtener barberías" });
    }
};

// Obtener barbería por ID (público)
export const getBarberia = async (req, res) => {
    try {
        const { id } = req.params;
        const barberia = await getBarbershopById(id);

        if (!barberia) {
            return res.status(404).json({ error: "Barbería no encontrada" });
        }

        // Excluir información sensible, como en el listado
        const { adminId, ...barberiaPublica } = barberia;
        res.json(barberiaPublica);
    } catch (error) {
        console.error("Error al obtener barbería:", error);
        res.status(500).json({ error: "Error al obtener barbería" });
    }
};

// Obtener barbería completa (admin o barbero autenticado)
export const getMyBarberia = async (req, res) => {
    try {
        const userId = req.user.id;
        let barberia = await getBarberiaByAdminId(userId);

        if (!barberia) {
            const user = await getUserById(userId);
            if (user && user.barberiaId) {
                barberia = await getBarbershopById(user.barberiaId.toString());
            }
        }

        if (!barberia) {
            return res.status(404).json({ error: "No tienes ninguna barbería asociada" });
        }

        res.json(barberia);
    } catch (error) {
        console.error("Error al obtener mi barbería:", error);
        res.status(500).json({ error: "Error al obtener barbería" });
    }
};

// REGISTRO DE BARBERÍA + ADMIN 

export const registerBarberia = async (req, res) => {
    try {
        const {
            // Datos de la barbería
            nombreBarberia,
            ciudad,
            direccion,
            telefono,
            descripcion,
            horario,
            schedule,
            // Datos del admin
            nombre,
            apellido,
            pw,
            usuario
        } = req.body;

        // Validar campos obligatorios (solo texto: evita operadores Mongo en las consultas)
        const obligatorios = [nombreBarberia, direccion, nombre, apellido, req.body.correo, pw, usuario];
        if (!obligatorios.every((valor) => typeof valor === "string" && valor.trim())) {
            return res.status(400).json({ error: "Todos los campos obligatorios deben completarse" });
        }

        const correo = normalizarCorreo(req.body.correo);

        const errorCredenciales = validarCorreo(correo) || validarPasswordNueva(pw);
        if (errorCredenciales) {
            return res.status(400).json({ error: errorCredenciales });
        }

        // Comprobación previa solo para responder rápido: la garantía real son los índices únicos (ver catch)
        const existingEmail = await getUserByEmail(correo);
        if (existingEmail) {
            return res.status(409).json({ error: MENSAJES_DUPLICADO.correo });
        }

        const existingUsername = await getUserByUsername(usuario);
        if (existingUsername) {
            return res.status(409).json({ error: MENSAJES_DUPLICADO.usuario });
        }

        // Encriptar contraseña del admin
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(pw, salt);

        // Crear usuario admin
        const adminUser = await createUser({
            nombre,
            apellido,
            correo,
            pw: hashedPassword,
            usuario,
            rol: "admin",
            barberiaId: null, // Se actualizará después
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Crear barbería
        const newBarberia = await createBarbershop({
            nombre: nombreBarberia,
            ciudad: typeof ciudad === "string" && ciudad.trim() ? ciudad.trim() : null,
            direccion,
            telefono: telefono || null,
            descripcion: descripcion || null,
            horario: horario || null,
            schedule: schedule || getDefaultBarberiaSchedule(),
            adminId: adminUser.insertedId,
            barberos: [],
            servicios: [],
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Actualizar el admin con el ID de la barbería
        const { updateUser } = await import("../models/userModel.js");
        await updateUser(adminUser.insertedId, { barberiaId: newBarberia.insertedId });

        // Generar token para el admin
        const token = jwt.sign(
            {
                id: adminUser.insertedId,
                correo,
                rol: "admin",
                barberiaId: newBarberia.insertedId
            },
            process.env.JWT_SECRET,
            { expiresIn: "24h" }
        );

        res.status(201).json({
            message: "Barbería y administrador creados correctamente",
            token,
            user: {
                id: adminUser.insertedId,
                nombre,
                apellido,
                correo,
                usuario,
                rol: "admin",
                barberiaId: newBarberia.insertedId
            },
            barberia: {
                id: newBarberia.insertedId,
                nombre: nombreBarberia
            }
        });

    } catch (error) {
        const duplicado = campoDuplicado(error);
        if (duplicado) {
            return res.status(409).json({ error: MENSAJES_DUPLICADO[duplicado] });
        }
        console.error("Error al registrar barbería:", error);
        res.status(500).json({ error: "Error al registrar barbería" });
    }
};

const MODOS_CONFIRMACION = ["automatico", "manual"];
const MAX_TAGS = 8;
const RE_TAG_VALIDA = /^[\p{L}\p{N} '-]{1,24}$/u;

// Valida y normaliza la lista de etiquetas de estilo de una barbería.
// Devuelve null si la entrada no es válida (para responder 400).
const sanearTags = (tags) => {
    if (!Array.isArray(tags) || tags.length > MAX_TAGS) return null;

    const vistos = new Set();
    const limpias = [];

    for (const tag of tags) {
        if (typeof tag !== "string") return null;
        const limpia = tag.trim().replace(/\s+/g, " ");
        if (!RE_TAG_VALIDA.test(limpia)) return null;

        const clave = limpia.toLowerCase();
        if (!vistos.has(clave)) {
            vistos.add(clave);
            limpias.push(limpia);
        }
    }

    return limpias;
};

// ACTUALIZAR BARBERÍA (SOLO ADMIN)

export const editBarberia = async (req, res) => {
    try {
        const { id } = req.params;
        const adminId = req.user.id;

        // Verificar que el usuario es admin de esta barbería
        const isAdmin = await isUserAdminOfBarberia(adminId, id);
        if (!isAdmin) {
            return res.status(403).json({ error: "No tienes permiso para editar esta barbería" });
        }

        const {
            nombre,
            ciudad,
            direccion,
            telefono,
            descripcion,
            horario,
            schedule,
            imagen,
            logoUrl,
            portadaUrl,
            galeriaTrabajos,
            tags,
            modoConfirmacion
        } = req.body;

        if (modoConfirmacion !== undefined && !MODOS_CONFIRMACION.includes(modoConfirmacion)) {
            return res.status(400).json({ error: "Modo de confirmación no válido. Usa automatico o manual" });
        }

        let tagsSaneados;
        if (tags !== undefined) {
            tagsSaneados = sanearTags(tags);
            if (tagsSaneados === null) {
                return res.status(400).json({ error: "Las etiquetas deben ser una lista de hasta 8 palabras de 1 a 24 caracteres" });
            }
        }

        // Solo actualizar los campos presentes en la petición para no borrar datos existentes.
        const updateData = {
            nombre,
            ciudad,
            direccion,
            telefono,
            descripcion,
            horario,
            schedule,
            imagen,
            logoUrl,
            portadaUrl,
            galeriaTrabajos,
            tags: tagsSaneados,
            modoConfirmacion,
            updatedAt: new Date()
        };

        const safeUpdateData = Object.fromEntries(
            Object.entries(updateData).filter(([_, value]) => value !== undefined)
        );

        await updateBarbershop(id, safeUpdateData);

        const updatedBarberia = await getBarbershopById(id);
        res.json({ message: "Barbería actualizada correctamente", barberia: updatedBarberia });

    } catch (error) {
        console.error("Error al actualizar barbería:", error);
        res.status(500).json({ error: "Error al actualizar barbería" });
    }
};

// Obtener horario estructurado de la barbería del usuario autenticado
// (admin o barbero: ambos necesitan poder leer el horario general de su
// barbería, aunque solo el admin pueda modificarlo).
export const getMyHorario = async (req, res) => {
    try {
        const userId = req.user.id;
        let barberia = await getBarberiaByAdminId(userId);

        if (!barberia) {
            const user = await getUserById(userId);
            if (user && user.barberiaId) {
                barberia = await getBarbershopById(user.barberiaId.toString());
            }
        }

        if (!barberia) {
            return res.status(404).json({ error: "No tienes ninguna barbería asociada" });
        }

        res.json({
            horario: barberia.schedule || getDefaultBarberiaSchedule(),
            legacyHorario: barberia.horario || null
        });
    } catch (error) {
        console.error("Error al obtener horario de la barbería:", error);
        res.status(500).json({ error: "Error al obtener horario de la barbería" });
    }
};

// Actualizar horario estructurado de la barbería del admin autenticado
export const updateMyHorario = async (req, res) => {
    try {
        const adminId = req.user.id;
        const barberia = await getBarberiaByAdminId(adminId);

        if (!barberia) {
            return res.status(404).json({ error: "No tienes ninguna barbería asociada" });
        }

        const { horario } = req.body;
        if (!horario || typeof horario !== "object") {
            return res.status(400).json({ error: "El horario debe enviarse como objeto" });
        }

        const updatedSchedule = {
            timezone: horario.timezone || "Europe/Madrid",
            weeklyTemplate: horario.weeklyTemplate || getDefaultBarberiaSchedule().weeklyTemplate,
            exceptions: Array.isArray(horario.exceptions) ? horario.exceptions : []
        };

        await updateBarbershop(barberia._id.toString(), {
            schedule: updatedSchedule,
            updatedAt: new Date()
        });

        const updatedBarberia = await getBarbershopById(barberia._id.toString());
        res.json({
            message: "Horario actualizado correctamente",
            horario: updatedBarberia?.schedule || updatedSchedule
        });
    } catch (error) {
        console.error("Error al actualizar horario de la barbería:", error);
        res.status(500).json({ error: "Error al actualizar horario de la barbería" });
    }
};

// **-*-*-*-*-*-*- SERVICIOS (SOLO ADMIN) -*-*-*-*-*-*

// Devuelve los datos normalizados del servicio o null si no son válidos
const validarServicio = ({ nombre, descripcion, precio, duracion }) => {
    const precioNum = Number(precio);
    const duracionNum = Number(duracion);
    if (typeof nombre !== "string" || !nombre.trim()) return null;
    if (!Number.isFinite(precioNum) || precioNum < 0) return null;
    if (!Number.isInteger(duracionNum) || duracionNum < 1 || duracionNum > 600) return null;
    if (descripcion !== undefined && descripcion !== null && typeof descripcion !== "string") return null;

    return {
        nombre: nombre.trim(),
        descripcion: descripcion || "",
        precio: precioNum,
        duracion: duracionNum // duración en minutos
    };
};

// Obtener servicios de una barbería (público)
export const getServicios = async (req, res) => {
    try {
        const { id } = req.params;
        const servicios = await getServiciosByBarberiaId(id);
        res.json(servicios);
    } catch (error) {
        console.error("Error al obtener servicios:", error);
        res.status(500).json({ error: "Error al obtener servicios" });
    }
};

// Obtener las reseñas de una barbería (público)
export const getResenasPublicas = async (req, res) => {
    try {
        const { id } = req.params;
        const resenas = await getResenasByBarberiaId(id);
        res.json(resenas);
    } catch (error) {
        console.error("Error al obtener reseñas:", error);
        res.status(500).json({ error: "Error al obtener reseñas" });
    }
};

// Añadir servicio (solo admin)
export const addServicio = async (req, res) => {
    try {
        const { id } = req.params;
        const adminId = req.user.id;

        const isAdmin = await isUserAdminOfBarberia(adminId, id);
        if (!isAdmin) {
            return res.status(403).json({ error: "No tienes permiso para añadir servicios" });
        }

        const datos = validarServicio(req.body);
        if (!datos) {
            return res.status(400).json({ error: "Nombre, precio (≥ 0) y duración (1-600 min) son obligatorios" });
        }

        const servicio = await addServicioToBarberia(id, datos);

        res.status(201).json({ message: "Servicio añadido correctamente", servicio });

    } catch (error) {
        console.error("Error al añadir servicio:", error);
        res.status(500).json({ error: "Error al añadir servicio" });
    }
};

// Actualizar servicio (solo admin)
export const editServicio = async (req, res) => {
    try {
        const { id, servicioId } = req.params;
        const adminId = req.user.id;

        const isAdmin = await isUserAdminOfBarberia(adminId, id);
        if (!isAdmin) {
            return res.status(403).json({ error: "No tienes permiso para editar servicios" });
        }

        const datos = validarServicio(req.body);
        if (!datos) {
            return res.status(400).json({ error: "Nombre, precio (≥ 0) y duración (1-600 min) son obligatorios" });
        }

        const result = await updateServicioInBarberia(id, servicioId, datos);
        if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Servicio no encontrado" });
        }

        const servicioActualizado = await getServicioById(id, servicioId);
        res.json({ message: "Servicio actualizado correctamente", servicio: servicioActualizado });

    } catch (error) {
        console.error("Error al actualizar servicio:", error);
        res.status(500).json({ error: "Error al actualizar servicio" });
    }
};

// Eliminar servicio (solo admin)
export const deleteServicio = async (req, res) => {
    try {
        const { id, servicioId } = req.params;
        const adminId = req.user.id;

        const isAdmin = await isUserAdminOfBarberia(adminId, id);
        if (!isAdmin) {
            return res.status(403).json({ error: "No tienes permiso para eliminar servicios" });
        }

        await removeServicioFromBarberia(id, servicioId);
        res.json({ message: "Servicio eliminado correctamente" });

    } catch (error) {
        console.error("Error al eliminar servicio:", error);
        res.status(500).json({ error: "Error al eliminar servicio" });
    }
};

// -*-**-*-*-*-*-*-*BARBEROS (SOLO ADMIN) -*-*-*-*-*-*-*-*-*-*-*--*-*--

// Datos de un barbero visibles para cualquiera (pantallas de reserva del cliente)
const CAMPOS_PUBLICOS_BARBERO = ["_id", "nombre", "apellido", "usuario", "avatar", "cargo", "rol", "serviciosBloqueados"];

// Obtener barberos de la barbería (público; el admin de la barbería recibe todos los datos)
export const getBarberos = async (req, res) => {
    try {
        const { id } = req.params;
        const barberos = await getBarberosByBarberiaId(id);

        const esAdminDeLaBarberia = req.user?.rol === "admin" && await isUserAdminOfBarberia(req.user.id, id);
        if (esAdminDeLaBarberia) {
            return res.json(barberos);
        }

        // Los desactivados no se ofrecen para reservar; el admin sí los recibe (con activo: false) para gestionarlos
        const barberosPublicos = barberos.filter(barberoActivo).map((barbero) =>
            Object.fromEntries(CAMPOS_PUBLICOS_BARBERO.filter((campo) => campo in barbero).map((campo) => [campo, barbero[campo]]))
        );
        res.json(barberosPublicos);
    } catch (error) {
        console.error("Error al obtener barberos:", error);
        res.status(500).json({ error: "Error al obtener barberos" });
    }
};

// Activar o desactivar a un barbero (solo el admin de su barbería). Desactivar no cancela sus citas:
// se devuelve cuántas futuras tiene para que el admin decida qué hacer con ellas
export const setEstadoBarbero = async (req, res) => {
    try {
        const { id, barberoId } = req.params;
        const { activo } = req.body;

        if (typeof activo !== "boolean") {
            return res.status(400).json({ error: "Indica si el barbero debe quedar activo o no" });
        }

        const isAdmin = await isUserAdminOfBarberia(req.user.id, id);
        if (!isAdmin) {
            return res.status(403).json({ error: "No tienes permiso para gestionar este equipo" });
        }

        const barbero = await getUserById(barberoId);
        if (!barbero || barbero.barberiaId?.toString() !== id) {
            return res.status(404).json({ error: "Barbero no encontrado en esta barbería" });
        }
        if (barbero.rol !== "barbero") {
            return res.status(400).json({ error: "Solo se puede activar o desactivar a los barberos del equipo" });
        }

        const actualizado = await setBarberoActivo(barberoId, activo);
        if (!actualizado) {
            return res.status(404).json({ error: "Barbero no encontrado en esta barbería" });
        }

        const ahora = new Date();
        const fecha = ahora.toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
        const hora = ahora.toLocaleTimeString("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hour12: false });
        const citasFuturas = await contarCitasFuturasBarbero(barberoId, fecha, hora);

        res.json({
            message: activo ? "Barbero activado" : "Barbero desactivado",
            activo,
            citasFuturas
        });
    } catch (error) {
        console.error("Error al cambiar el estado del barbero:", error);
        res.status(500).json({ error: "Error al cambiar el estado del barbero" });
    }
};

// Eliminar barbero de la barbería (solo admin)
export const removeBarbero = async (req, res) => {
    try {
        const { id, barberoId } = req.params;
        const adminId = req.user.id;

        const isAdmin = await isUserAdminOfBarberia(adminId, id);
        if (!isAdmin) {
            return res.status(403).json({ error: "No tienes permiso para eliminar barberos" });
        }

        const barbero = await getUserById(barberoId);
        if (!barbero) {
            return res.status(404).json({ error: "Barbero no encontrado" });
        }

        if (barbero.barberiaId?.toString() !== id) {
            return res.status(403).json({ error: "Acceso denegado: el barbero no pertenece a tu barbería" });
        }

        await removeBarberoFromBarberia(id, barberoId);

        // Actualizar el usuario para quitar la referencia a la barbería
        const { updateUser } = await import("../models/userModel.js");
        await updateUser(barberoId, { barberiaId: null });

        res.json({ message: "Barbero eliminado de la barbería correctamente" });

    } catch (error) {
        console.error("Error al eliminar barbero:", error);
        res.status(500).json({ error: "Error al eliminar barbero" });
    }
};

// -*-*-*-*-*-*-*- INVITACIONES DE EMPLEADOS (SOLO ADMIN) -*-*-*-*-*-*-*-*-*-

// Crear invitación: el admin da de alta al futuro barbero y recibe un
// código de un solo uso para enviárselo. El código solo se muestra aquí,
// en la base de datos únicamente se guarda su hash.
export const createInvitacionEmpleado = async (req, res) => {
    try {
        const adminId = req.user.id;
        const barberia = await getBarberiaByAdminId(adminId);

        if (!barberia) {
            return res.status(404).json({ error: "No tienes ninguna barbería asociada" });
        }

        const { nombre, apellido, cargo } = req.body;

        if (!nombre?.trim() || !apellido?.trim() || !cargo?.trim()) {
            return res.status(400).json({ error: "Nombre, apellido y puesto son obligatorios" });
        }

        const codigo = generateInvitationCode();
        const expiresAt = new Date(Date.now() + INVITACION_DIAS_VALIDEZ * 24 * 60 * 60 * 1000);

        const invitacion = await createInvitacion({
            barberiaId: barberia._id,
            nombre: nombre.trim(),
            apellido: apellido.trim(),
            cargo: cargo.trim(),
            codigoHash: hashInvitationCode(codigo),
            estado: "pendiente",
            expiresAt,
            createdBy: new ObjectId(adminId),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        res.status(201).json({
            message: "Invitación creada correctamente",
            invitacion: {
                id: invitacion.insertedId,
                nombre,
                apellido,
                cargo,
                estado: "pendiente",
                expiresAt,
                codigo // Se devuelve una única vez; no se puede recuperar después
            }
        });

    } catch (error) {
        console.error("Error al crear invitación:", error);
        res.status(500).json({ error: "Error al crear invitación" });
    }
};

// Listar invitaciones de la barbería del admin autenticado
export const getInvitacionesEmpleados = async (req, res) => {
    try {
        const adminId = req.user.id;
        const barberia = await getBarberiaByAdminId(adminId);

        if (!barberia) {
            return res.status(404).json({ error: "No tienes ninguna barbería asociada" });
        }

        const invitaciones = await getInvitacionesByBarberia(barberia._id);
        // No se expone codigoHash
        const invitacionesSeguras = invitaciones.map(({ codigoHash, ...inv }) => inv);
        res.json(invitacionesSeguras);

    } catch (error) {
        console.error("Error al obtener invitaciones:", error);
        res.status(500).json({ error: "Error al obtener invitaciones" });
    }
};

// Regenerar el código de una invitación pendiente (invalida el anterior)
export const regenerarInvitacionEmpleado = async (req, res) => {
    try {
        const adminId = req.user.id;
        const { invitacionId } = req.params;
        const barberia = await getBarberiaByAdminId(adminId);

        if (!barberia) {
            return res.status(404).json({ error: "No tienes ninguna barbería asociada" });
        }

        const codigo = generateInvitationCode();
        const expiresAt = new Date(Date.now() + INVITACION_DIAS_VALIDEZ * 24 * 60 * 60 * 1000);

        const invitacion = await regenerarInvitacionCode(
            invitacionId,
            barberia._id,
            hashInvitationCode(codigo),
            expiresAt
        );

        if (!invitacion) {
            return res.status(404).json({ error: "Invitación no encontrada o ya utilizada" });
        }

        res.json({
            message: "Código regenerado correctamente",
            invitacion: {
                id: invitacion._id,
                nombre: invitacion.nombre,
                apellido: invitacion.apellido,
                cargo: invitacion.cargo,
                estado: invitacion.estado,
                expiresAt,
                codigo
            }
        });

    } catch (error) {
        console.error("Error al regenerar invitación:", error);
        res.status(500).json({ error: "Error al regenerar invitación" });
    }
};

// Revocar (invalidar) una invitación pendiente
export const revocarInvitacionEmpleado = async (req, res) => {
    try {
        const adminId = req.user.id;
        const { invitacionId } = req.params;
        const barberia = await getBarberiaByAdminId(adminId);

        if (!barberia) {
            return res.status(404).json({ error: "No tienes ninguna barbería asociada" });
        }

        const result = await revocarInvitacion(invitacionId, barberia._id);
        if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Invitación no encontrada o ya utilizada" });
        }

        res.json({ message: "Invitación revocada correctamente" });

    } catch (error) {
        console.error("Error al revocar invitación:", error);
        res.status(500).json({ error: "Error al revocar invitación" });
    }
};

// Eliminar una invitación (usada, expirada o revocada) del listado
export const deleteInvitacionEmpleado = async (req, res) => {
    try {
        const adminId = req.user.id;
        const { invitacionId } = req.params;
        const barberia = await getBarberiaByAdminId(adminId);

        if (!barberia) {
            return res.status(404).json({ error: "No tienes ninguna barbería asociada" });
        }

        const result = await deleteInvitacion(invitacionId, barberia._id);
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: "Invitación no encontrada" });
        }

        res.json({ message: "Invitación eliminada correctamente" });

    } catch (error) {
        console.error("Error al eliminar invitación:", error);
        res.status(500).json({ error: "Error al eliminar invitación" });
    }
};

// VALIDAR CÓDIGO DE INVITACIÓN (público, paso 1 del registro de barbero)

export const validateInvitationCode = async (req, res) => {
    try {
        const { code } = req.body;

        const normalizado = normalizeInvitationCode(code);
        if (!normalizado) {
            return res.status(400).json({ valid: false, error: "Formato de código inválido" });
        }

        const invitacion = await getInvitacionPendienteByHash(hashInvitationCode(normalizado));

        if (!invitacion || invitacion.expiresAt < new Date()) {
            return res.status(404).json({ valid: false, error: "Código inválido o caducado" });
        }

        const barberia = await getBarbershopById(invitacion.barberiaId.toString());

        res.json({
            valid: true,
            nombre: invitacion.nombre,
            apellido: invitacion.apellido,
            cargo: invitacion.cargo,
            nombreBarberia: barberia?.nombre || null
        });

    } catch (error) {
        console.error("Error al validar código de invitación:", error);
        res.status(500).json({ error: "Error al validar código" });
    }
};