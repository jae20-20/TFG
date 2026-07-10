//manejar http request - Citas
import {
    checkBarberoDisponibilidad,
    createCita,
    getCitaById,
    getCitasByBarberiaId,
    getCitasByBarberoAndFecha,
    getCitasByBarberoId,
    getCitasByClienteId,
    updateCitaEstado,
    updateCitaPago
} from "../models/citaModel.js";

import { getBarbershopById, getServicioById, isUserAdminOfBarberia } from "../models/barbershopModel.js";
import { getUserById } from "../models/userModel.js";

//CREAR CITA (CLIENTE)

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

        if (barbero.serviciosBloqueados && barbero.serviciosBloqueados.includes(servicioId.toString())) {
            return res.status(400).json({ error: "Este barbero no realiza el servicio seleccionado" });
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

// CREAR CITA MANUAL (ADMIN O BARBERO)
export const crearCitaManual = async (req, res) => {
    try {
        const userId = req.user.id;
        const userRol = req.user.rol;
        const { barberoId, servicioId, fecha, horaInicio, clienteNombre } = req.body;

        if (!barberoId || !servicioId || !fecha || !horaInicio) {
            return res.status(400).json({ error: "Barbero, servicio, fecha y hora son obligatorios" });
        }

        const barbero = await getUserById(barberoId);
        if (!barbero || !barbero.barberiaId) {
            return res.status(404).json({ error: "Barbero no encontrado o no asociado a una barbería" });
        }

        const barberiaId = barbero.barberiaId.toString();

        if (userRol === "barbero" && userId !== barberoId) {
            return res.status(403).json({ error: "No puedes crear citas para otros barberos" });
        }

        if (userRol === "admin") {
            const isAdmin = await isUserAdminOfBarberia(userId, barberiaId);
            if (!isAdmin && req.user.barberiaId !== barberiaId) {
                return res.status(403).json({ error: "No tienes permiso para gestionar citas en esta barbería" });
            }
        }

        const servicio = await getServicioById(barberiaId, servicioId);
        if (!servicio) {
            return res.status(404).json({ error: "Servicio no encontrado en esta barbería" });
        }

        const [horas, minutos] = horaInicio.split(":").map(Number);
        const fechaInicio = new Date();
        fechaInicio.setHours(horas, minutos, 0, 0);
        fechaInicio.setMinutes(fechaInicio.getMinutes() + (servicio.duracion || 30));
        const horaFin = `${String(fechaInicio.getHours()).padStart(2, "0")}:${String(fechaInicio.getMinutes()).padStart(2, "0")}`;

        const disponible = await checkBarberoDisponibilidad(barberoId, fecha, horaInicio, horaFin);
        if (!disponible) {
            return res.status(409).json({ error: "El barbero no está disponible en ese horario" });
        }

        const nuevaCita = await createCita({
            clienteId: null,
            clienteNombre: clienteNombre?.trim() || "Reserva manual",
            barberoId,
            barberiaId,
            servicioId,
            fecha,
            horaInicio,
            horaFin,
            servicioNombre: servicio.nombre,
            servicioPrecio: servicio.precio,
            servicioDuracion: servicio.duracion || 30,
            estado: "confirmada"
        });

        res.status(201).json({
            message: "Cita manual creada correctamente",
            cita: {
                id: nuevaCita.insertedId,
                fecha,
                horaInicio,
                horaFin,
                servicio: servicio.nombre,
                clienteNombre: clienteNombre?.trim() || "Reserva manual",
                estado: "confirmada"
            }
        });
    } catch (error) {
        console.error("Error al crear cita manual:", error);
        res.status(500).json({ error: "Error al crear cita manual" });
    }
};

//  OBTENER CITAS

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

//  ACTUALIZAR ESTADO DE CITA

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
        const citaActualizada = await getCitaById(id);
        console.log(`[DEBUG] Cita ${id} confirmada por usuario ${userId}. Estado anterior: ${cita.estado} -> Nuevo: confirmada`);
        res.json({
            message: "Cita confirmada correctamente",
            debug: {
                action: "confirmarCita",
                citaId: id,
                previousEstado: cita.estado,
                newEstado: "confirmada",
                modifiedBy: userId,
                timestamp: new Date().toISOString()
            },
            cita: citaActualizada
        });

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
        const citaActualizada = await getCitaById(id);
        console.log(`[DEBUG] Cita ${id} completada por usuario ${userId}. Estado anterior: ${cita.estado} -> Nuevo: completada`);
        res.json({
            message: "Cita completada correctamente",
            debug: {
                action: "completarCita",
                citaId: id,
                previousEstado: cita.estado,
                newEstado: "completada",
                modifiedBy: userId,
                timestamp: new Date().toISOString()
            },
            cita: citaActualizada
        });

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

        const isCliente = cita.clienteId?.toString() === userId;
        const isBarbero = cita.barberoId.toString() === userId;
        const isAdmin = await isUserAdminOfBarberia(userId, cita.barberiaId.toString());

        if (!isCliente && !isBarbero && !isAdmin) {
            return res.status(403).json({ error: "No tienes permiso para cancelar esta cita" });
        }

        await updateCitaEstado(id, "cancelada");
        const citaActualizada = await getCitaById(id);
        console.log(`[DEBUG] Cita ${id} cancelada por usuario ${userId}. Estado anterior: ${cita.estado} -> Nuevo: cancelada`);
        res.json({
            message: "Cita cancelada correctamente",
            debug: {
                action: "cancelarCita",
                citaId: id,
                previousEstado: cita.estado,
                newEstado: "cancelada",
                modifiedBy: userId,
                timestamp: new Date().toISOString()
            },
            cita: citaActualizada
        });

    } catch (error) {
        console.error("Error al cancelar cita:", error);
        res.status(500).json({ error: "Error al cancelar cita" });
    }
};

// DISPONIBILIDAD

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

        const schedule = barberia.schedule || {
            timezone: "Europe/Madrid",
            weeklyTemplate: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
            exceptions: []
        };

        const dateObj = new Date(fecha);
        const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const dayKey = days[dateObj.getDay()];

        let slotsForDay = [];
        let isClosed = false;

        const exception = schedule.exceptions?.find(e => e.date === fecha);
        if (exception) {
            if (exception.type === 'closed') {
                isClosed = true;
            } else {
                slotsForDay = exception.slots || [];
            }
        } else {
            slotsForDay = schedule.weeklyTemplate?.[dayKey] || [];
            if (slotsForDay.length === 0) {
                isClosed = true;
            }
        }

        if (isClosed) {
            return res.json({
                fecha,
                barberoId,
                estado: "cerrado",
                horariosDisponibles: []
            });
        }

        const horariosDisponibles = [];
        const intervalo = 30; // minutos

        for (const slot of slotsForDay) {
            if (!slot.start || !slot.end) continue;
            let current = new Date(`1970-01-01T${slot.start}:00`);
            const end = new Date(`1970-01-01T${slot.end}:00`);

            while (current < end) {
                const horaStr = `${String(current.getHours()).padStart(2, "0")}:${String(current.getMinutes()).padStart(2, "0")}`;

                // Verificar si este horario está ocupado
                const ocupado = citasOcupadas.some(cita => {
                    return horaStr >= cita.horaInicio && horaStr < cita.horaFin;
                });

                if (!ocupado) {
                    horariosDisponibles.push(horaStr);
                }
                
                current.setMinutes(current.getMinutes() + intervalo);
            }
        }

        let estado = horariosDisponibles.length === 0 ? "completo" : "abierto";

        res.json({
            fecha,
            barberoId,
            estado,
            horariosDisponibles
        });

    } catch (error) {
        console.error("Error al obtener disponibilidad:", error);
        res.status(500).json({ error: "Error al obtener disponibilidad" });
    }
};

// Actualizar pago e importe de cita (barbero o admin)
export const actualizarPagoCita = async (req, res) => {
    try {
        const { id } = req.params;
        const { pagado, importePagado } = req.body;
        const userId = req.user.id;

        const cita = await getCitaById(id);
        if (!cita) {
            return res.status(404).json({ error: "Cita no encontrada" });
        }

        const isBarbero = cita.barberoId.toString() === userId;
        const isAdmin = await isUserAdminOfBarberia(userId, cita.barberiaId.toString());

        if (!isBarbero && !isAdmin) {
            return res.status(403).json({ error: "No tienes permiso para modificar esta cita" });
        }

        const nuevoImporte = importePagado !== undefined ? Number(importePagado) : (cita.importePagado !== undefined ? cita.importePagado : cita.servicioPrecio);

        await updateCitaPago(id, Boolean(pagado), nuevoImporte);
        const citaActualizada = await getCitaById(id);
        console.log(`[DEBUG] Cita ${id} pago actualizado por usuario ${userId}. Pagado: ${cita.pagado} -> ${Boolean(pagado)}, Importe: ${cita.importePagado} -> ${nuevoImporte}`);
        res.json({
            message: "Estado de pago actualizado correctamente",
            pagado: Boolean(pagado),
            importePagado: nuevoImporte,
            debug: {
                action: "actualizarPagoCita",
                citaId: id,
                previousPagado: cita.pagado,
                newPagado: Boolean(pagado),
                previousImporte: cita.importePagado,
                newImporte: nuevoImporte,
                modifiedBy: userId,
                timestamp: new Date().toISOString()
            },
            cita: citaActualizada
        });

    } catch (error) {
        console.error("Error al actualizar pago de cita:", error);
        res.status(500).json({ error: "Error al actualizar pago de cita" });
    }
};
