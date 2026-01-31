//manejar http request - Citas
import {
    checkBarberoDisponibilidad,
    createCita,
    getCitaById,
    getCitasByBarberiaId,
    getCitasByBarberoAndFecha,
    getCitasByBarberoId,
    getCitasByClienteId,
    updateCitaEstado
} from "../models/citaModel.js";

import { getBarbershopById, getServicioById, isUserAdminOfBarberia } from "../models/barbershopModel.js";
import { getUserById } from "../models/userModel.js";

// ==================== CREAR CITA (CLIENTE) ====================

export const crearCita = async (req, res) => {
    try {
        const clienteId = req.user.id;
        const { barberiaId, barberoId, servicioId, fecha, horaInicio } = req.body;

        // Validar campos obligatorios
        if (!barberiaId || !barberoId || !servicioId || !fecha || !horaInicio) {
            return res.status(400).json({ error: "Todos los campos son obligatorios" });
        }

        // Verificar que la barbería existe
        const barberia = await getBarbershopById(barberiaId);
        if (!barberia) {
            return res.status(404).json({ error: "Barbería no encontrada" });
        }

        // Verificar que el servicio existe
        const servicio = await getServicioById(barberiaId, servicioId);
        if (!servicio) {
            return res.status(404).json({ error: "Servicio no encontrado" });
        }

        // Verificar que el barbero existe y pertenece a la barbería
        const barbero = await getUserById(barberoId);
        if (!barbero || barbero.barberiaId?.toString() !== barberiaId) {
            return res.status(404).json({ error: "Barbero no encontrado en esta barbería" });
        }

        // Calcular hora de fin basada en la duración del servicio
        const [horas, minutos] = horaInicio.split(":").map(Number);
        const fechaInicio = new Date();
        fechaInicio.setHours(horas, minutos, 0, 0);
        fechaInicio.setMinutes(fechaInicio.getMinutes() + servicio.duracion);
        const horaFin = `${String(fechaInicio.getHours()).padStart(2, "0")}:${String(fechaInicio.getMinutes()).padStart(2, "0")}`;

        // Verificar disponibilidad del barbero
        const disponible = await checkBarberoDisponibilidad(barberoId, fecha, horaInicio, horaFin);
        if (!disponible) {
            return res.status(409).json({ error: "El barbero no está disponible en ese horario" });
        }

        // Crear la cita
        const nuevaCita = await createCita({
            clienteId,
            barberoId,
            barberiaId,
            servicioId,
            fecha,
            horaInicio,
            horaFin,
            servicioNombre: servicio.nombre,
            servicioPrecio: servicio.precio,
            servicioDuracion: servicio.duracion
        });

        res.status(201).json({
            message: "Cita creada correctamente",
            cita: {
                id: nuevaCita.insertedId,
                fecha,
                horaInicio,
                horaFin,
                servicio: servicio.nombre,
                barberia: barberia.nombre
            }
        });

    } catch (error) {
        console.error("Error al crear cita:", error);
        res.status(500).json({ error: "Error al crear cita" });
    }
};

// ==================== OBTENER CITAS ====================

// Obtener mis citas (cliente)
export const getMisCitas = async (req, res) => {
    try {
        const clienteId = req.user.id;
        const citas = await getCitasByClienteId(clienteId);
        res.json(citas);
    } catch (error) {
        console.error("Error al obtener citas:", error);
        res.status(500).json({ error: "Error al obtener citas" });
    }
};

// Obtener citas del barbero
export const getCitasBarbero = async (req, res) => {
    try {
        const barberoId = req.user.id;
        const citas = await getCitasByBarberoId(barberoId);
        res.json(citas);
    } catch (error) {
        console.error("Error al obtener citas:", error);
        res.status(500).json({ error: "Error al obtener citas" });
    }
};

// Obtener citas de la barbería (admin)
export const getCitasBarberia = async (req, res) => {
    try {
        const { barberiaId } = req.params;
        const adminId = req.user.id;

        // Verificar que es admin de la barbería
        const isAdmin = await isUserAdminOfBarberia(adminId, barberiaId);
        if (!isAdmin && req.user.rol !== "admin") {
            return res.status(403).json({ error: "No tienes permiso para ver estas citas" });
        }

        const citas = await getCitasByBarberiaId(barberiaId);
        res.json(citas);
    } catch (error) {
        console.error("Error al obtener citas de barbería:", error);
        res.status(500).json({ error: "Error al obtener citas" });
    }
};

// Obtener cita por ID
export const getCita = async (req, res) => {
    try {
        const { id } = req.params;
        const cita = await getCitaById(id);

        if (!cita) {
            return res.status(404).json({ error: "Cita no encontrada" });
        }

        // Verificar que el usuario tiene acceso a esta cita
        const userId = req.user.id;
        const isCliente = cita.clienteId.toString() === userId;
        const isBarbero = cita.barberoId.toString() === userId;
        const isAdmin = await isUserAdminOfBarberia(userId, cita.barberiaId.toString());

        if (!isCliente && !isBarbero && !isAdmin) {
            return res.status(403).json({ error: "No tienes permiso para ver esta cita" });
        }

        res.json(cita);
    } catch (error) {
        console.error("Error al obtener cita:", error);
        res.status(500).json({ error: "Error al obtener cita" });
    }
};

// ==================== ACTUALIZAR ESTADO DE CITA ====================

// Confirmar cita (barbero o admin)
export const confirmarCita = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const cita = await getCitaById(id);
        if (!cita) {
            return res.status(404).json({ error: "Cita no encontrada" });
        }

        // Verificar permisos
        const isBarbero = cita.barberoId.toString() === userId;
        const isAdmin = await isUserAdminOfBarberia(userId, cita.barberiaId.toString());

        if (!isBarbero && !isAdmin) {
            return res.status(403).json({ error: "No tienes permiso para confirmar esta cita" });
        }

        await updateCitaEstado(id, "confirmada");
        res.json({ message: "Cita confirmada correctamente" });

    } catch (error) {
        console.error("Error al confirmar cita:", error);
        res.status(500).json({ error: "Error al confirmar cita" });
    }
};

// Completar cita (barbero o admin)
export const completarCita = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const cita = await getCitaById(id);
        if (!cita) {
            return res.status(404).json({ error: "Cita no encontrada" });
        }

        const isBarbero = cita.barberoId.toString() === userId;
        const isAdmin = await isUserAdminOfBarberia(userId, cita.barberiaId.toString());

        if (!isBarbero && !isAdmin) {
            return res.status(403).json({ error: "No tienes permiso para completar esta cita" });
        }

        await updateCitaEstado(id, "completada");
        res.json({ message: "Cita completada correctamente" });

    } catch (error) {
        console.error("Error al completar cita:", error);
        res.status(500).json({ error: "Error al completar cita" });
    }
};

// Cancelar cita (cliente, barbero o admin)
export const cancelarCita = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const cita = await getCitaById(id);
        if (!cita) {
            return res.status(404).json({ error: "Cita no encontrada" });
        }

        const isCliente = cita.clienteId.toString() === userId;
        const isBarbero = cita.barberoId.toString() === userId;
        const isAdmin = await isUserAdminOfBarberia(userId, cita.barberiaId.toString());

        if (!isCliente && !isBarbero && !isAdmin) {
            return res.status(403).json({ error: "No tienes permiso para cancelar esta cita" });
        }

        await updateCitaEstado(id, "cancelada");
        res.json({ message: "Cita cancelada correctamente" });

    } catch (error) {
        console.error("Error al cancelar cita:", error);
        res.status(500).json({ error: "Error al cancelar cita" });
    }
};

// ==================== DISPONIBILIDAD ====================

// Obtener horarios disponibles de un barbero en una fecha
export const getDisponibilidad = async (req, res) => {
    try {
        const { barberoId, fecha } = req.params;
        const { barberiaId } = req.query;

        if (!barberiaId) {
            return res.status(400).json({ error: "Se requiere el ID de la barbería" });
        }

        // Obtener barbería para conocer horario
        const barberia = await getBarbershopById(barberiaId);
        if (!barberia) {
            return res.status(404).json({ error: "Barbería no encontrada" });
        }

        // Obtener citas del barbero en esa fecha
        const citasOcupadas = await getCitasByBarberoAndFecha(barberoId, fecha);

        // Generar slots disponibles (simplificado - horario 9:00 a 20:00, intervalos de 30 min)
        const horariosDisponibles = [];
        const horaInicio = 9;
        const horaFin = 20;
        const intervalo = 30; // minutos

        for (let hora = horaInicio; hora < horaFin; hora++) {
            for (let minuto = 0; minuto < 60; minuto += intervalo) {
                const horaStr = `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
                
                // Verificar si este horario está ocupado
                const ocupado = citasOcupadas.some(cita => {
                    return horaStr >= cita.horaInicio && horaStr < cita.horaFin;
                });

                if (!ocupado) {
                    horariosDisponibles.push(horaStr);
                }
            }
        }

        res.json({
            fecha,
            barberoId,
            horariosDisponibles
        });

    } catch (error) {
        console.error("Error al obtener disponibilidad:", error);
        res.status(500).json({ error: "Error al obtener disponibilidad" });
    }
};
