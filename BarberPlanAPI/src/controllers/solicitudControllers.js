import { ObjectId } from "mongodb";
import { createSolicitud, getSolicitudesByBarbero, getSolicitudesByBarberia, updateSolicitudEstado, deleteSolicitud, getSolicitudById } from "../models/solicitudModel.js";
import { getUserById, updateUser } from "../models/userModel.js";
import { getBarberiaByAdminId, getServicioById, isUserAdminOfBarberia } from "../models/barbershopModel.js";
import { esObjectIdValido } from "../middleware/validateMiddleware.js";

const TIPOS_SOLICITUD = ["dia_libre", "vacaciones", "horas_puntuales", "bloqueo_servicio"];
const MAX_DIAS_SOLICITUD = 366;
const MAX_FRANJAS = 24;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

// Crear nueva solicitud (Barbero)
export const createBarberSolicitud = async (req, res) => {
    try {
        const { tipo, fechaInicio, fechaFin, motivo, franjas, servicioId } = req.body;
        const barberoId = req.user.id;
        const barbero = await getUserById(barberoId);

        if (!barbero) return res.status(404).json({ error: "Barbero no encontrado" });
        if (!barbero.barberiaId) return res.status(400).json({ error: "El barbero no pertenece a ninguna barbería" });

        if (!TIPOS_SOLICITUD.includes(tipo)) {
            return res.status(400).json({ error: "Tipo de solicitud no válido" });
        }

        const inicio = typeof fechaInicio === "string" ? Date.parse(fechaInicio) : NaN;
        const fin = typeof fechaFin === "string" ? Date.parse(fechaFin) : NaN;
        if (Number.isNaN(inicio) || Number.isNaN(fin) || fin < inicio) {
            return res.status(400).json({ error: "Fechas no válidas" });
        }
        if ((fin - inicio) / (24 * 60 * 60 * 1000) > MAX_DIAS_SOLICITUD) {
            return res.status(400).json({ error: `El periodo no puede superar ${MAX_DIAS_SOLICITUD} días` });
        }

        if (motivo !== undefined && typeof motivo !== "string") {
            return res.status(400).json({ error: "Motivo no válido" });
        }

        // Las franjas solo aplican a horas puntuales; el formulario envía filas vacías que se descartan
        let franjasLimpias = [];
        if (tipo === "horas_puntuales") {
            const rellenas = (Array.isArray(franjas) ? franjas : []).filter((f) => f && (f.start || f.end));
            const validas = rellenas.every((f) => RE_HORA.test(f.start) && RE_HORA.test(f.end) && f.start < f.end);
            if (rellenas.length === 0 || rellenas.length > MAX_FRANJAS || !validas) {
                return res.status(400).json({ error: "Franjas horarias no válidas" });
            }
            franjasLimpias = rellenas.map((f) => ({ start: f.start, end: f.end }));
        }

        // El servicio debe existir en la barbería del barbero; el nombre sale de la BD, no del cliente
        let servicio = null;
        if (tipo === "bloqueo_servicio") {
            servicio = esObjectIdValido(servicioId) ? await getServicioById(barbero.barberiaId.toString(), servicioId) : null;
            if (!servicio) {
                return res.status(400).json({ error: "Servicio no válido" });
            }
        }

        const solicitudData = {
            barberoId: new ObjectId(barberoId),
            barberiaId: new ObjectId(barbero.barberiaId),
            tipo,
            fechaInicio,
            fechaFin,
            motivo: motivo ? motivo.trim().slice(0, 500) : "",
            franjas: franjasLimpias,
            servicioId: servicio ? servicio._id.toString() : null,
            servicioNombre: servicio ? servicio.nombre : null
        };

        const result = await createSolicitud(solicitudData);
        res.status(201).json({ message: "Solicitud creada exitosamente", id: result.insertedId });
    } catch (error) {
        console.error("Error al crear solicitud:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
};

// Obtener mis solicitudes (Barbero)
export const getMisSolicitudes = async (req, res) => {
    try {
        const solicitudes = await getSolicitudesByBarbero(req.user.id);
        res.json({ solicitudes });
    } catch (error) {
        console.error("Error al obtener solicitudes:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
};

// Obtener solicitudes del equipo (Admin)
export const getSolicitudesEquipo = async (req, res) => {
    try {
        const barberia = await getBarberiaByAdminId(req.user.id);
        if (!barberia) return res.status(400).json({ error: "No tienes una barbería asignada" });

        const solicitudes = await getSolicitudesByBarberia(barberia._id);

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
        res.status(500).json({ error: "Error interno del servidor" });
    }
};

// Responder a solicitud (Admin)
export const responderSolicitud = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado, respuestaAdmin } = req.body; // estado: "aprobada" | "rechazada"

        if (!["aprobada", "rechazada"].includes(estado)) {
            return res.status(400).json({ error: "Estado no válido" });
        }

        const solicitud = await getSolicitudById(id);
        if (!solicitud) return res.status(404).json({ error: "Solicitud no encontrada" });

        const esAdminDeSuBarberia = await isUserAdminOfBarberia(req.user.id, solicitud.barberiaId.toString());
        if (!esAdminDeSuBarberia) {
            return res.status(403).json({ error: "Acceso denegado: solicitud no vinculada a tu barbería" });
        }

        // Responder dos veces duplicaría vacaciones o días libres
        if (solicitud.estado !== "pendiente") {
            return res.status(409).json({ error: "La solicitud ya fue respondida" });
        }

        // Solo cambia si sigue pendiente: si otra respuesta simultánea se adelantó, no se aplica el efecto dos veces
        const { matchedCount } = await updateSolicitudEstado(id, estado, respuestaAdmin);
        if (matchedCount === 0) {
            return res.status(409).json({ error: "La solicitud ya fue respondida" });
        }

        // Si se aprueba, actualizar días libres/vacaciones del barbero
        if (estado === "aprobada") {
            const barbero = await getUserById(solicitud.barberoId);
            if (barbero) {
                let diasLibres = barbero.diasLibres || [];
                let vacaciones = barbero.vacaciones || [];
                // Sin horario propio sigue el de la barbería: activar esta plantilla vacía lo dejaría ausente todos los días
                let horarioPersonal = barbero.horarioPersonal || { enabled: false, timezone: 'Europe/Madrid', weeklyTemplate: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }, exceptions: [] };
                
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
        res.status(500).json({ error: "Error interno del servidor" });
    }
};

// Eliminar solicitud (Barbero)
export const eliminarSolicitud = async (req, res) => {
    try {
        const { id } = req.params;
        const solicitud = await getSolicitudById(id);
        
        if (!solicitud) return res.status(404).json({ error: "Solicitud no encontrada" });
        if (solicitud.barberoId.toString() !== req.user.id) {
            return res.status(403).json({ error: "No autorizado para eliminar esta solicitud" });
        }
        if (solicitud.estado !== "pendiente") {
            return res.status(409).json({ error: "Solo se pueden eliminar solicitudes pendientes" });
        }

        await deleteSolicitud(id);
        res.json({ message: "Solicitud eliminada exitosamente" });
    } catch (error) {
        console.error("Error al eliminar solicitud:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
};
