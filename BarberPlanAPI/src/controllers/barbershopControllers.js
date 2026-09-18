//manejar http request - Barberías
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import {
    addServicioToBarberia,
    createBarbershop,
    generateUniqueCode,
    getAllBarbershops,
    getBarberiaByAdminId,
    getBarberiaByCode,
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

import { createUser, getUserByEmail, getUserByUsername, getUserById } from "../models/userModel.js";
import { getResenasByBarberiaId } from "../models/citaModel.js";


// Obtener todas las barberías (público)
export const getBarberias = async (req, res) => {
    try {
        const barberias = await getAllBarbershops();
        // Excluir información sensible
        const barberiasPublicas = barberias.map(({ codigo, adminId, ...barberia }) => barberia);
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

        // Excluir código para usuarios no admin
        const { codigo, ...barberiaPublica } = barberia;
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
            } else if (req.user.barberiaId) {
                barberia = await getBarbershopById(req.user.barberiaId.toString());
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
            direccion,
            telefono,
            descripcion,
            horario,
            schedule,
            // Datos del admin
            nombre,
            apellido,
            correo,
            pw,
            usuario
        } = req.body;

        // Validar campos obligatorios
        if (!nombreBarberia || !direccion || !nombre || !apellido || !correo || !pw || !usuario) {
            return res.status(400).json({ error: "Todos los campos obligatorios deben completarse" });
        }

        // Verificar si el correo ya existe
        const existingEmail = await getUserByEmail(correo);
        if (existingEmail) {
            return res.status(400).json({ error: "El correo ya está registrado" });
        }

        // Verificar si el usuario ya existe
        const existingUsername = await getUserByUsername(usuario);
        if (existingUsername) {
            return res.status(400).json({ error: "El nombre de usuario ya está en uso" });
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

        // Generar código único para la barbería
        let codigo;
        let codigoExiste = true;
        while (codigoExiste) {
            codigo = generateUniqueCode();
            const barberiaConCodigo = await getBarberiaByCode(codigo);
            codigoExiste = !!barberiaConCodigo;
        }

        // Crear barbería
        const newBarberia = await createBarbershop({
            nombre: nombreBarberia,
            direccion,
            telefono: telefono || null,
            descripcion: descripcion || null,
            horario: horario || null,
            schedule: schedule || getDefaultBarberiaSchedule(),
            codigo,
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
                nombre: nombreBarberia,
                codigo // Mostrar código solo en el registro
            }
        });

    } catch (error) {
        console.error("Error al registrar barbería:", error);
        res.status(500).json({ error: "Error al registrar barbería" });
    }
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
            galeriaTrabajos
        } = req.body;

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

// Obtener horario estructurado de la barbería del admin autenticado
export const getMyHorario = async (req, res) => {
    try {
        const adminId = req.user.id;
        const barberia = await getBarberiaByAdminId(adminId);

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

        const { nombre, descripcion, precio, duracion } = req.body;

        if (!nombre || !precio || !duracion) {
            return res.status(400).json({ error: "Nombre, precio y duración son obligatorios" });
        }

        const servicio = await addServicioToBarberia(id, {
            nombre,
            descripcion: descripcion || "",
            precio: parseFloat(precio),
            duracion: parseInt(duracion) // duración en minutos
        });

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

        const { nombre, descripcion, precio, duracion } = req.body;

        await updateServicioInBarberia(id, servicioId, {
            nombre,
            descripcion,
            precio: parseFloat(precio),
            duracion: parseInt(duracion)
        });

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

// Obtener barberos de la barbería
export const getBarberos = async (req, res) => {
    try {
        const { id } = req.params;
        const barberos = await getBarberosByBarberiaId(id);
        res.json(barberos);
    } catch (error) {
        console.error("Error al obtener barberos:", error);
        res.status(500).json({ error: "Error al obtener barberos" });
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

// VALIDAR CÓDIGO

export const validateCode = async (req, res) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({ error: "El código es obligatorio" });
        }

        const barberia = await getBarberiaByCode(code);

        if (!barberia) {
            return res.status(404).json({ valid: false, error: "Código inválido" });
        }

        res.json({
            valid: true,
            barberia: {
                id: barberia._id,
                nombre: barberia.nombre
            }
        });

    } catch (error) {
        console.error("Error al validar código:", error);
        res.status(500).json({ error: "Error al validar código" });
    }
};