import { ObjectId } from "mongodb";
import { createSolicitud, getSolicitudesByBarbero, getSolicitudesByBarberia, updateSolicitudEstado, deleteSolicitud, getSolicitudById } from "../models/solicitudModel.js";
import { getUserById, updateUser } from "../models/userModel.js";

// Crear nueva solicitud (Barbero)
export const createBarberSolicitud = async (req, res) => {
    try {
        const { tipo, fechaInicio, fechaFin, motivo, franjas } = req.body;
        const barberoId = req.user.id;
        const barbero = await getUserById(barberoId);

        if (!barbero) return res.status(404).json({ message: "Barbero no encontrado" });
        if (!barbero.barberiaId) return res.status(400).json({ message: "El barbero no pertenece a ninguna barbería" });

        const solicitudData = {
            barberoId: new ObjectId(barberoId),
            barberiaId: new ObjectId(barbero.barberiaId),
            tipo,
            fechaInicio,
            fechaFin,
            motivo,
            franjas: franjas || [],
            servicioId: req.body.servicioId || null,
            servicioNombre: req.body.servicioNombre || null
        };

        const result = await createSolicitud(solicitudData);
        res.status(201).json({ message: "Solicitud creada exitosamente", id: result.insertedId });
    } catch (error) {
        console.error("Error al crear solicitud:", error);
        res.status(500).json({ message: "Error interno del servidor", error: error.message });
    }
};

// Obtener mis solicitudes (Barbero)
export const getMisSolicitudes = async (req, res) => {
    try {
        const solicitudes = await getSolicitudesByBarbero(req.user.id);
        res.json({ solicitudes });
    } catch (error) {
        console.error("Error al obtener solicitudes:", error);
        res.status(500).json({ message: "Error interno del servidor", error: error.message });
    }
};

// Obtener solicitudes del equipo (Admin)
export const getSolicitudesEquipo = async (req, res) => {
    try {
        const barberiaId = req.user.barberiaId;
        if (!barberiaId) return res.status(400).json({ message: "No tienes una barbería asignada" });

        const solicitudes = await getSolicitudesByBarberia(barberiaId);

        // Populate barbero names for admin view
        const populatedSolicitudes = await Promise.all(solicitudes.map(async (sol) => {
            const barbero = await getUserById(sol.barberoId);
            return {
                ...sol,
                barberoNombre: barbero ? `${barbero.nombre} ${barbero.apellido || ''}`.trim() : 'Desconocido',
                barberoAvatar: barbero?.avatar || null
            };
        }));

        res.json({ solicitudes: populatedSolicitudes });
    } catch (error) {
        console.error("Error al obtener solicitudes del equipo:", error);
        res.status(500).json({ message: "Error interno del servidor", error: error.message });
    }
};

// Responder a solicitud (Admin)
export const responderSolicitud = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado, respuestaAdmin } = req.body; // estado: "aprobada" | "rechazada"

        if (!["aprobada", "rechazada"].includes(estado)) {
            return res.status(400).json({ message: "Estado no válido" });
        }

        const solicitud = await getSolicitudById(id);
        if (!solicitud) return res.status(404).json({ message: "Solicitud no encontrada" });

        // Update estado
        await updateSolicitudEstado(id, estado, respuestaAdmin);

        // Si se aprueba, actualizar días libres/vacaciones del barbero
        if (estado === "aprobada") {
            const barbero = await getUserById(solicitud.barberoId);
            if (barbero) {
                let diasLibres = barbero.diasLibres || [];
                let vacaciones = barbero.vacaciones || [];
                let horarioPersonal = barbero.horarioPersonal || { enabled: true, timezone: 'Europe/Madrid', weeklyTemplate: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }, exceptions: [] };
                
                if (!horarioPersonal.exceptions) horarioPersonal.exceptions = [];

                if (solicitud.tipo.toLowerCase().includes("bloqueo")) {
                    let serviciosBloqueados = barbero.serviciosBloqueados || [];
                    const sId = solicitud.servicioId ? solicitud.servicioId.toString() : null;
                    if (sId && !serviciosBloqueados.includes(sId)) {
                        serviciosBloqueados.push(sId);
                    }
                    await updateUser(solicitud.barberoId, { serviciosBloqueados });
                } else if (solicitud.tipo.toLowerCase().includes("vacacion")) {
                    vacaciones.push({
                        fechaInicio: solicitud.fechaInicio,
                        fechaFin: solicitud.fechaFin,
                        motivo: solicitud.motivo
                    });
                    await updateUser(solicitud.barberoId, { diasLibres, vacaciones, horarioPersonal });
                } else if (solicitud.tipo === "horas_puntuales") {
                    if (solicitud.franjas && solicitud.franjas.length > 0) {
                        solicitud.franjas.forEach(f => {
                            horarioPersonal.exceptions.push({
                                date: solicitud.fechaInicio,
                                type: 'custom',
                                start: f.start,
                                end: f.end,
                                isAbsence: true
                            });
                        });
                        horarioPersonal.enabled = true;
                    }
                    await updateUser(solicitud.barberoId, { diasLibres, vacaciones, horarioPersonal });
                } else {
                    // Generar fechas entre inicio y fin y agregarlas a diasLibres
                    let current = new Date(solicitud.fechaInicio);
                    let end = new Date(solicitud.fechaFin);
                    
                    while (current <= end) {
                        const dateStr = current.toISOString().split('T')[0];
                        if (!diasLibres.includes(dateStr)) {
                            diasLibres.push(dateStr);
                        }
                        current.setDate(current.getDate() + 1);
                    }
                    await updateUser(solicitud.barberoId, { diasLibres, vacaciones, horarioPersonal });
                }
            }
        }

        res.json({ message: "Solicitud respondida exitosamente" });
    } catch (error) {
        console.error("Error al responder solicitud:", error);
        res.status(500).json({ message: "Error interno del servidor", error: error.message });
    }
};

// Eliminar solicitud (Barbero)
export const eliminarSolicitud = async (req, res) => {
    try {
        const { id } = req.params;
        const solicitud = await getSolicitudById(id);
        
        if (!solicitud) return res.status(404).json({ message: "Solicitud no encontrada" });
        if (solicitud.barberoId.toString() !== req.user.id) {
            return res.status(403).json({ message: "No autorizado para eliminar esta solicitud" });
        }
        if (solicitud.estado !== "pendiente") {
            return res.status(400).json({ message: "Solo se pueden eliminar solicitudes pendientes" });
        }

        await deleteSolicitud(id);
        res.json({ message: "Solicitud eliminada exitosamente" });
    } catch (error) {
        console.error("Error al eliminar solicitud:", error);
        res.status(500).json({ message: "Error interno del servidor", error: error.message });
    }
};
