//manejar http request - Citas
import {
    createCita,
    getCitaById,
    getCitasBarberiaEnRango,
    getCitasByBarberiaId,
    getCitasByBarberoAndFecha,
    getCitasByBarberoId,
    getCitasByClienteId,
    getClientesConCitasAnteriores,
    getResenasByBarberiaId,
    setResenaCita,
    transicionarCita,
    updateCitaPago
} from "../models/citaModel.js";

import { esObjectIdValido } from "../middleware/validateMiddleware.js";
import { getBarberiaByAdminId, getBarberosByBarberiaId, getBarbershopById, getServicioById, isUserAdminOfBarberia } from "../models/barbershopModel.js";
import { getUserById } from "../models/userModel.js";

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

// Plazo para aceptar o rechazar una reserva cuando la barbería confirma manualmente
const PLAZO_RESPUESTA_MS = 24 * 60 * 60 * 1000;

// Duración de cada hueco de la agenda; también es cuánto puede llevar empezada una cita manual (cliente que llega sin reserva)
const INTERVALO_HUECOS_MIN = 30;

// Estado destino -> estados de origen permitidos; cancelada, completada y no_presentada son finales
const TRANSICIONES = {
    confirmada: ["pendiente"],
    completada: ["confirmada"],
    no_presentada: ["confirmada"],
    cancelada: ["pendiente", "confirmada"]
};

const NOMBRE_ESTADO = {
    pendiente: "pendiente",
    confirmada: "confirmada",
    completada: "completada",
    no_presentada: "no presentada",
    cancelada: "cancelada"
};

// Fecha "YYYY-MM-DD" y hora "HH:MM" actuales en Madrid
const momentoActual = () => {
    const ahora = new Date();
    return {
        fecha: ahora.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }),
        hora: ahora.toLocaleTimeString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false })
    };
};

const haEmpezado = (cita) => {
    const { fecha, hora } = momentoActual();
    return cita.fecha < fecha || (cita.fecha === fecha && cita.horaInicio <= hora);
};

// Relación del usuario con la cita según la BD; un barbero que ya dejó la barbería pierde el acceso
const relacionConCita = async (userId, cita) => {
    const barberiaId = cita.barberiaId.toString();
    const esCliente = cita.clienteId?.toString() === userId;
    const esAdmin = await isUserAdminOfBarberia(userId, barberiaId);
    let esBarbero = false;
    if (cita.barberoId?.toString() === userId) {
        const barbero = await getUserById(userId);
        esBarbero = barbero?.barberiaId?.toString() === barberiaId;
    }
    return { esCliente, esBarbero, esAdmin };
};

// Hora de fin "HH:MM"; null si la cita terminaría pasada la medianoche
const calcularHoraFin = (horaInicio, duracion) => {
    const [horas, minutos] = horaInicio.split(":").map(Number);
    const totalMinutos = horas * 60 + minutos + duracion;
    if (totalMinutos >= 24 * 60) return null;
    return `${String(Math.floor(totalMinutos / 60)).padStart(2, "0")}:${String(totalMinutos % 60).padStart(2, "0")}`;
};

// "HH:MM" menos unos minutos, sin bajar de "00:00"
const restarMinutos = (hora, minutos) => {
    const [h, m] = hora.split(":").map(Number);
    const total = Math.max(0, h * 60 + m - minutos);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

// Huecos de inicio libres de un barbero en una fecha, combinando el horario de
// la barbería, el horario/ausencias del barbero y las citas ya ocupadas.
// incluirEnCurso añade el hueco que ya empezó (para citas manuales del personal)
const calcularDisponibilidad = (barberia, barbero, fecha, citasOcupadas, incluirEnCurso = false) => {
    const schedule = barberia.schedule || {
        timezone: "Europe/Madrid",
        weeklyTemplate: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
        exceptions: []
    };

    const dateObj = new Date(fecha);
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayKey = days[dateObj.getDay()];

    let slotsForDay = [];
    let isBarberiaClosed = false;
    let isBarberoClosed = false;

    // 1. Horario base de la barbería
    const exception = schedule.exceptions?.find(e => e.date === fecha);
    if (exception) {
        if (exception.type === 'closed') {
            isBarberiaClosed = true;
        } else {
            slotsForDay = exception.slots || [];
        }
    } else {
        slotsForDay = schedule.weeklyTemplate?.[dayKey] || [];
        if (slotsForDay.length === 0) {
            isBarberiaClosed = true;
        }
    }

    // 2. Aplicar excepciones y horario del BARBERO
    const barberExceptions = (barbero.horarioPersonal?.exceptions || []).filter(ex => ex.date === fecha);
    const customOpeningSlots = barberExceptions.filter(ex => !ex.isAbsence && ex.type !== 'closed' && ex.start && ex.end);
    const absenceSlots = barberExceptions.filter(ex => ex.isAbsence === true && ex.start && ex.end);
    const hasClosedException = barberExceptions.some(ex => ex.type === 'closed' || (ex.isAbsence === true && !ex.start));

    if (customOpeningSlots.length > 0) {
        // Si el barbero tiene franjas específicas abiertas para este día (ej: abiertas por el admin)
        slotsForDay = customOpeningSlots.map(s => ({ start: s.start, end: s.end }));
        isBarberiaClosed = false;
        isBarberoClosed = false;
    } else if (hasClosedException || (barbero.diasLibres && barbero.diasLibres.includes(fecha))) {
        // Si no tiene franjas abiertas explícitas y el día está en días libres o cerrado
        isBarberoClosed = true;
    } else if (barbero.horarioPersonal?.enabled && barbero.horarioPersonal?.weeklyTemplate?.[dayKey]) {
        // Si el barbero tiene plantilla semanal propia
        slotsForDay = barbero.horarioPersonal.weeklyTemplate[dayKey];
        if (slotsForDay.length === 0) {
            isBarberoClosed = true;
        }
    }

    if (isBarberiaClosed) {
        return { estado: "cerrado", horariosDisponibles: [] };
    }

    if (isBarberoClosed || slotsForDay.length === 0) {
        return { estado: "ausente", horariosDisponibles: [] };
    }

    let horariosDisponibles = [];

    for (const slot of slotsForDay) {
        if (!slot.start || !slot.end) continue;
        let current = new Date(`1970-01-01T${slot.start}:00`);
        const end = new Date(`1970-01-01T${slot.end}:00`);

        while (current < end) {
            const horaStr = `${String(current.getHours()).padStart(2, "0")}:${String(current.getMinutes()).padStart(2, "0")}`;

            // Verificar si este horario está ocupado por una cita
            const ocupado = citasOcupadas.some(cita => {
                return horaStr >= cita.horaInicio && horaStr < cita.horaFin;
            });

            // Verificar si cae en una ausencia parcial del barbero (cierre parcial)
            const enAusencia = absenceSlots.some(abs => {
                return horaStr >= abs.start && horaStr < abs.end;
            });

            if (!ocupado && !enAusencia) {
                horariosDisponibles.push(horaStr);
            }

            current.setMinutes(current.getMinutes() + INTERVALO_HUECOS_MIN);
        }
    }

    // Si la fecha es hoy, filtrar slots que ya han pasado
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: schedule.timezone || 'Europe/Madrid' });
    if (fecha === hoy) {
        const ahora = new Date().toLocaleTimeString('en-GB', {
            timeZone: schedule.timezone || 'Europe/Madrid',
            hour: '2-digit', minute: '2-digit', hour12: false
        });
        const desde = incluirEnCurso ? restarMinutos(ahora, INTERVALO_HUECOS_MIN) : ahora;
        horariosDisponibles = horariosDisponibles.filter(hora => hora > desde);
    }

    return {
        estado: horariosDisponibles.length === 0 ? "completo" : "abierto",
        horariosDisponibles
    };
};

//CREAR CITA (CLIENTE)

export const crearCita = async (req, res) => {
    try {
        const clienteId = req.user.id;
        const { barberiaId, barberoId, servicioId, fecha, horaInicio, comentario } = req.body;

        // Validar campos obligatorios
        if (!barberiaId || !barberoId || !servicioId || !fecha || !horaInicio) {
            return res.status(400).json({ error: "Todos los campos son obligatorios" });
        }

        if (![barberiaId, barberoId, servicioId].every(esObjectIdValido)) {
            return res.status(400).json({ error: "Identificador no válido" });
        }

        if (!RE_FECHA.test(fecha) || !RE_HORA.test(horaInicio)) {
            return res.status(400).json({ error: "Formato de fecha u hora no válido" });
        }

        const comentarioLimpio = typeof comentario === "string" ? comentario.trim().slice(0, 300) : "";

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

        // Validar que no se reserve en el pasado
        const ahora = momentoActual();
        if (fecha < ahora.fecha) {
            return res.status(400).json({ error: "No se pueden crear citas en fechas pasadas" });
        }
        if (fecha === ahora.fecha && horaInicio <= ahora.hora) {
            return res.status(400).json({ error: "No se pueden crear citas en horarios que ya han pasado" });
        }

        const horaFin = calcularHoraFin(horaInicio, servicio.duracion);
        if (!horaFin) {
            return res.status(400).json({ error: "El servicio no cabe en ese día" });
        }

        // La hora debe ser uno de los huecos que se ofrecen (horario abierto, sin ausencias)
        const citasDelDia = await getCitasByBarberoAndFecha(barberoId, fecha);
        const { horariosDisponibles } = calcularDisponibilidad(barberia, barbero, fecha, citasDelDia);
        if (!horariosDisponibles.includes(horaInicio)) {
            return res.status(409).json({ error: "El barbero no está disponible en ese horario" });
        }

        const requiereAprobacion = barberia.modoConfirmacion === "manual";

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
            servicioDuracion: servicio.duracion,
            comentario: comentarioLimpio,
            estado: requiereAprobacion ? "pendiente" : "confirmada",
            ...(requiereAprobacion && { expiraEn: new Date(Date.now() + PLAZO_RESPUESTA_MS) })
        });

        if (!nuevaCita) {
            return res.status(409).json({ error: "El barbero no está disponible en ese horario" });
        }

        res.status(201).json({
            message: requiereAprobacion
                ? "Reserva enviada. La barbería debe aceptarla"
                : "Cita creada correctamente",
            cita: {
                id: nuevaCita._id,
                fecha,
                horaInicio,
                horaFin,
                servicio: servicio.nombre,
                barberia: barberia.nombre,
                estado: nuevaCita.estado,
                expiraEn: nuevaCita.expiraEn ?? null
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

        if (![barberoId, servicioId].every(esObjectIdValido)) {
            return res.status(400).json({ error: "Identificador no válido" });
        }

        if (!RE_FECHA.test(fecha) || !RE_HORA.test(horaInicio)) {
            return res.status(400).json({ error: "Formato de fecha u hora no válido" });
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
            if (!isAdmin) {
                return res.status(403).json({ error: "No tienes permiso para gestionar citas en esta barbería" });
            }
        }

        const servicio = await getServicioById(barberiaId, servicioId);
        if (!servicio) {
            return res.status(404).json({ error: "Servicio no encontrado en esta barbería" });
        }

        // Validar que no se reserve en el pasado
        const ahora = momentoActual();
        if (fecha < ahora.fecha) {
            return res.status(400).json({ error: "No se pueden crear citas en fechas pasadas" });
        }
        if (fecha === ahora.fecha && horaInicio <= restarMinutos(ahora.hora, INTERVALO_HUECOS_MIN)) {
            return res.status(400).json({ error: `Solo se pueden registrar citas que empezaron hace menos de ${INTERVALO_HUECOS_MIN} minutos` });
        }

        const horaFin = calcularHoraFin(horaInicio, servicio.duracion || 30);
        if (!horaFin) {
            return res.status(400).json({ error: "El servicio no cabe en ese día" });
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

        if (!nuevaCita) {
            return res.status(409).json({ error: "El barbero no está disponible en ese horario" });
        }

        res.status(201).json({
            message: "Cita manual creada correctamente",
            cita: {
                id: nuevaCita._id,
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
        if (!isAdmin) {
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

        const { esCliente, esBarbero, esAdmin } = await relacionConCita(req.user.id, cita);
        if (!esCliente && !esBarbero && !esAdmin) {
            return res.status(403).json({ error: "No tienes permiso para ver esta cita" });
        }

        res.json(cita);
    } catch (error) {
        console.error("Error al obtener cita:", error);
        res.status(500).json({ error: "Error al obtener cita" });
    }
};

//  ACTUALIZAR ESTADO DE CITA

const describirEstado = (estado) => NOMBRE_ESTADO[estado] || estado;

// Acciones reservadas al barbero asignado o al admin de la barbería de la cita
const accionDelPersonal = ({ origenes, destino, verbo, campos = {}, comprobarMomento, mensaje }) => async (req, res) => {
    try {
        const { id } = req.params;
        const cita = await getCitaById(id);
        if (!cita) {
            return res.status(404).json({ error: "Cita no encontrada" });
        }

        const { esBarbero, esAdmin } = await relacionConCita(req.user.id, cita);
        if (!esBarbero && !esAdmin) {
            return res.status(403).json({ error: `No tienes permiso para ${verbo} esta cita` });
        }

        if (!origenes.includes(cita.estado)) {
            return res.status(409).json({ error: `No se puede ${verbo} una cita ${describirEstado(cita.estado)}` });
        }

        const motivo = comprobarMomento?.(cita);
        if (motivo) {
            return res.status(409).json({ error: motivo });
        }

        const citaActualizada = await transicionarCita(id, [cita.estado], destino, campos);
        if (!citaActualizada) {
            return res.status(409).json({ error: "La cita ha cambiado mientras tanto. Recarga e inténtalo de nuevo" });
        }

        res.json({ message: mensaje, cita: citaActualizada });
    } catch (error) {
        console.error(`Error al ${verbo} cita:`, error);
        res.status(500).json({ error: `Error al ${verbo} cita` });
    }
};

const reservaCaducada = (cita) =>
    (cita.expiraEn && cita.expiraEn <= new Date()) || haEmpezado(cita) ? "Esta reserva ha caducado" : null;

const asistenciaPrematura = (cita) =>
    haEmpezado(cita) ? null : "La asistencia se registra a partir de la hora de la cita";

// Aceptar una reserva pendiente
export const confirmarCita = accionDelPersonal({
    origenes: TRANSICIONES.confirmada,
    destino: "confirmada",
    verbo: "aceptar",
    comprobarMomento: reservaCaducada,
    mensaje: "Reserva aceptada"
});

// Rechazar una reserva pendiente
export const rechazarCita = accionDelPersonal({
    origenes: ["pendiente"],
    destino: "cancelada",
    verbo: "rechazar",
    campos: { motivoCancelacion: "rechazada" },
    mensaje: "Reserva rechazada"
});

// El cliente acudió a la cita
export const completarCita = accionDelPersonal({
    origenes: TRANSICIONES.completada,
    destino: "completada",
    verbo: "completar",
    comprobarMomento: asistenciaPrematura,
    mensaje: "Cita completada correctamente"
});

// El cliente no acudió a la cita
export const marcarNoPresentada = accionDelPersonal({
    origenes: TRANSICIONES.no_presentada,
    destino: "no_presentada",
    verbo: "marcar como no presentada",
    comprobarMomento: asistenciaPrematura,
    mensaje: "Cita marcada como no presentada"
});

// Cancelar cita: el cliente antes de que empiece; el barbero asignado o el admin en cualquier momento
export const cancelarCita = async (req, res) => {
    try {
        const { id } = req.params;
        const cita = await getCitaById(id);
        if (!cita) {
            return res.status(404).json({ error: "Cita no encontrada" });
        }

        const { esCliente, esBarbero, esAdmin } = await relacionConCita(req.user.id, cita);
        const esPersonal = esBarbero || esAdmin;
        if (!esCliente && !esPersonal) {
            return res.status(403).json({ error: "No tienes permiso para cancelar esta cita" });
        }

        if (!TRANSICIONES.cancelada.includes(cita.estado)) {
            return res.status(409).json({ error: `No se puede cancelar una cita ${describirEstado(cita.estado)}` });
        }

        if (!esPersonal && haEmpezado(cita)) {
            return res.status(409).json({ error: "La cita ya ha empezado. Si necesitas cancelarla, contacta con la barbería" });
        }

        const citaActualizada = await transicionarCita(id, [cita.estado], "cancelada", {
            motivoCancelacion: esPersonal ? "barberia" : "cliente"
        });
        if (!citaActualizada) {
            return res.status(409).json({ error: "La cita ha cambiado mientras tanto. Recarga e inténtalo de nuevo" });
        }

        res.json({ message: "Cita cancelada correctamente", cita: citaActualizada });
    } catch (error) {
        console.error("Error al cancelar cita:", error);
        res.status(500).json({ error: "Error al cancelar cita" });
    }
};

// RESEÑAS

// Dejar una reseña sobre una cita completada (cliente dueño de la cita)
export const crearResena = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const { valoracion, comentario, imagen } = req.body;

        const cita = await getCitaById(id);
        if (!cita) {
            return res.status(404).json({ error: "Cita no encontrada" });
        }

        const isCliente = cita.clienteId?.toString() === userId;
        if (!isCliente) {
            return res.status(403).json({ error: "No tienes permiso para reseñar esta cita" });
        }

        if (cita.estado !== "completada") {
            return res.status(409).json({ error: "Solo puedes reseñar citas completadas" });
        }

        if (cita.resena) {
            return res.status(409).json({ error: "Esta cita ya tiene una reseña" });
        }

        const valoracionNum = Number(valoracion);
        if (!Number.isInteger(valoracionNum) || valoracionNum < 1 || valoracionNum > 5) {
            return res.status(400).json({ error: "La valoración debe ser un número entero entre 1 y 5" });
        }

        const comentarioLimpio = typeof comentario === "string" ? comentario.trim().slice(0, 500) : "";

        let imagenLimpia = null;
        if (typeof imagen === "string" && imagen.length > 0) {
            if (!imagen.startsWith("data:image/") || imagen.length > 4_000_000) {
                return res.status(400).json({ error: "Imagen no válida" });
            }
            imagenLimpia = imagen;
        }

        const resena = {
            valoracion: valoracionNum,
            comentario: comentarioLimpio,
            imagen: imagenLimpia,
            createdAt: new Date()
        };

        const { modifiedCount } = await setResenaCita(id, resena);
        if (modifiedCount === 0) {
            return res.status(409).json({ error: "Esta cita ya tiene una reseña" });
        }
        res.status(201).json({ message: "Reseña guardada correctamente", resena });

    } catch (error) {
        console.error("Error al crear reseña:", error);
        res.status(500).json({ error: "Error al crear reseña" });
    }
};

// Obtener las reseñas de la barbería del admin/barbero autenticado
export const getResenasBarberia = async (req, res) => {
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

        const resenas = await getResenasByBarberiaId(barberia._id.toString());
        res.json(resenas);
    } catch (error) {
        console.error("Error al obtener reseñas de la barbería:", error);
        res.status(500).json({ error: "Error al obtener reseñas" });
    }
};

// DISPONIBILIDAD

// Obtener horarios disponibles de un barbero en una fecha
export const getDisponibilidad = async (req, res) => {
    try {
        const { barberoId, fecha } = req.params;
        const { barberiaId } = req.query;
        const incluirEnCurso = req.query.incluirEnCurso === "true";

        if (!esObjectIdValido(barberiaId)) {
            return res.status(400).json({ error: "Se requiere el ID de la barbería" });
        }

        if (!RE_FECHA.test(fecha)) {
            return res.status(400).json({ error: "Formato de fecha no válido" });
        }

        // Obtener barbería para conocer horario base
        const barberia = await getBarbershopById(barberiaId);
        if (!barberia) {
            return res.status(404).json({ error: "Barbería no encontrada" });
        }

        // Obtener barbero para conocer su horario personal, excepciones y días libres
        const barbero = await getUserById(barberoId);
        if (!barbero || barbero.barberiaId?.toString() !== barberiaId) {
            return res.status(404).json({ error: "Barbero no encontrado en esta barbería" });
        }

        // Obtener citas del barbero en esa fecha
        const citasOcupadas = await getCitasByBarberoAndFecha(barberoId, fecha);
        const { estado, horariosDisponibles } = calcularDisponibilidad(barberia, barbero, fecha, citasOcupadas, incluirEnCurso);

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

        const cita = await getCitaById(id);
        if (!cita) {
            return res.status(404).json({ error: "Cita no encontrada" });
        }

        const { esBarbero, esAdmin } = await relacionConCita(req.user.id, cita);
        if (!esBarbero && !esAdmin) {
            return res.status(403).json({ error: "No tienes permiso para modificar esta cita" });
        }

        const nuevoImporte = importePagado !== undefined ? Number(importePagado) : (cita.importePagado !== undefined ? cita.importePagado : cita.servicioPrecio);
        if (!Number.isFinite(nuevoImporte) || nuevoImporte < 0) {
            return res.status(400).json({ error: "El importe debe ser un número mayor o igual que 0" });
        }

        const MENSAJE_PAGO_NO_PERMITIDO = "Solo se puede registrar el pago de citas confirmadas o completadas";
        if (cita.estado !== "confirmada" && cita.estado !== "completada") {
            return res.status(409).json({ error: MENSAJE_PAGO_NO_PERMITIDO });
        }

        // Cobrar una cita ya empezada implica que el cliente vino; un pago adelantado no la completa.
        // Desmarcar un cobro hecho por error devuelve la cita a confirmada si fue el cobro el que la completó
        // (no si se completó con el botón, por la tarea automática o si ya tiene reseña)
        const completar = Boolean(pagado) && cita.estado === "confirmada" && haEmpezado(cita);
        const revertir = !pagado && cita.estado === "completada" && cita.completadaPorPago === true && !cita.resena;
        const { matchedCount } = await updateCitaPago(id, Boolean(pagado), nuevoImporte, { completar, revertir });
        if (matchedCount === 0) {
            return res.status(409).json({ error: MENSAJE_PAGO_NO_PERMITIDO });
        }
        const citaActualizada = await getCitaById(id);
        res.json({
            message: "Estado de pago actualizado correctamente",
            pagado: Boolean(pagado),
            importePagado: nuevoImporte,
            cita: citaActualizada
        });

    } catch (error) {
        console.error("Error al actualizar pago de cita:", error);
        res.status(500).json({ error: "Error al actualizar pago de cita" });
    }
};

// ANALÍTICAS 

const PERIODOS_ANALITICA = ["dia", "semana", "mes"];
const DIAS_SEMANA_CORTOS = ["L", "M", "X", "J", "V", "S", "D"];
const MS_DIA = 24 * 60 * 60 * 1000;

const redondear = (n) => Math.round(n * 100) / 100;
const precioDe = (cita) => Number(cita.servicioPrecio) || 0;
const cobradoDe = (cita) => (cita.pagado ? Number(cita.importePagado) || 0 : 0);

const parsearFecha = (texto) => {
    if (!RE_FECHA.test(texto)) return null;
    const [y, m, d] = texto.split("-").map(Number);
    const fecha = new Date(Date.UTC(y, m - 1, d));
    const valida = fecha.getUTCFullYear() === y && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
    return valida ? fecha : null;
};
const formatearFecha = (fecha) => fecha.toISOString().slice(0, 10);
const sumarDias = (fecha, dias) => new Date(fecha.getTime() + dias * MS_DIA);

const calcularRango = (periodo, base) => {
    if (periodo === "dia") return { desde: base, hasta: base };
    if (periodo === "semana") {
        const desde = sumarDias(base, -((base.getUTCDay() + 6) % 7));
        return { desde, hasta: sumarDias(desde, 6) };
    }
    return {
        desde: new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1)),
        hasta: new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0))
    };
};

const calcularRangoAnterior = (periodo, desde) => {
    if (periodo === "mes") return calcularRango(periodo, new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth() - 1, 1)));
    return calcularRango(periodo, sumarDias(desde, periodo === "dia" ? -1 : -7));
};

// Esperado: confirmadas y completadas. Real: solo completadas y cobradas. Los no-show van aparte
const esAtendible = (cita) => cita.estado === "confirmada" || cita.estado === "completada";
const esIngresoReal = (cita) => cita.estado === "completada" && cita.pagado;
const sumarPrecios = (citas) => citas.reduce((total, c) => total + precioDe(c), 0);
const nombreClienteDe = (cita) =>
    [cita.cliente?.nombre, cita.cliente?.apellido].filter(Boolean).join(" ") || cita.clienteNombre || "Cliente";

const resumirCitas = (citas) => {
    const conEstado = (estado) => citas.filter(c => c.estado === estado);
    const atendibles = citas.filter(esAtendible);
    const completadas = conEstado("completada");
    const noPresentadas = conEstado("no_presentada");
    const cobradas = citas.filter(esIngresoReal);
    const ingresosReales = cobradas.reduce((total, c) => total + cobradoDe(c), 0);
    const conAsistencia = completadas.length + noPresentadas.length;
    return {
        citas: atendibles.length + noPresentadas.length,
        completadas: completadas.length,
        canceladas: conEstado("cancelada").length,
        noPresentadas: noPresentadas.length,
        pendientesAprobacion: conEstado("pendiente").length,
        tasaNoPresentadas: conAsistencia > 0 ? Math.round((noPresentadas.length / conAsistencia) * 100) : 0,
        importeNoPresentadas: redondear(sumarPrecios(noPresentadas)),
        ingresosEsperados: redondear(sumarPrecios(atendibles)),
        ingresosReales: redondear(ingresosReales),
        pendienteCobro: redondear(sumarPrecios(atendibles.filter(c => !c.pagado))),
        ticketMedio: cobradas.length > 0 ? redondear(ingresosReales / cobradas.length) : 0
    };
};

const construirSerie = (periodo, desde, hasta, citas) => {
    const puntos = new Map();
    let claveDe;

    if (periodo === "dia") {
        const horas = citas.map(c => Number(c.horaInicio?.slice(0, 2))).filter(Number.isInteger);
        if (horas.length === 0) return [];
        for (let h = Math.min(...horas); h <= Math.max(...horas); h++) {
            puntos.set(String(h).padStart(2, "0"), { etiqueta: `${h}h`, esperados: 0, reales: 0, citas: 0 });
        }
        claveDe = (c) => c.horaInicio?.slice(0, 2);
    } else {
        for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
            const etiqueta = periodo === "semana" ? DIAS_SEMANA_CORTOS[(d.getUTCDay() + 6) % 7] : String(d.getUTCDate());
            puntos.set(formatearFecha(d), { etiqueta, esperados: 0, reales: 0, citas: 0 });
        }
        claveDe = (c) => c.fecha;
    }

    for (const cita of citas) {
        const punto = puntos.get(claveDe(cita));
        if (!punto) continue;
        if (esAtendible(cita)) {
            punto.esperados += precioDe(cita);
            punto.citas++;
        }
        if (esIngresoReal(cita)) {
            punto.reales += cobradoDe(cita);
        }
    }

    return [...puntos.values()].map(p => ({ ...p, esperados: redondear(p.esperados), reales: redondear(p.reales) }));
};

const desglosarPorBarbero = (citas, barberos) => {
    const filas = new Map(barberos.map(b => [b._id.toString(), {
        id: b._id.toString(),
        nombre: [b.nombre, b.apellido].filter(Boolean).join(" ") || b.usuario || "Barbero",
        avatar: b.avatar || null,
        citas: []
    }]));

    for (const cita of citas) {
        const id = cita.barberoId?.toString();
        if (!id) continue;
        if (!filas.has(id)) filas.set(id, { id, nombre: "Antiguo empleado", avatar: null, citas: [] });
        filas.get(id).citas.push(cita);
    }

    return [...filas.values()]
        .map(({ citas: citasBarbero, ...barbero }) => {
            const { citas: total, completadas, canceladas, noPresentadas, ingresosEsperados, ingresosReales } = resumirCitas(citasBarbero);
            return { ...barbero, citas: total, completadas, canceladas, noPresentadas, ingresosEsperados, ingresosReales };
        })
        .sort((a, b) => b.ingresosReales - a.ingresosReales || b.ingresosEsperados - a.ingresosEsperados);
};

const analizarClientes = async (barberiaId, citas, desde) => {
    const atendibles = citas.filter(esAtendible);
    const porCliente = new Map();

    for (const cita of atendibles) {
        if (!cita.clienteId) continue;
        const id = cita.clienteId.toString();
        if (!porCliente.has(id)) {
            porCliente.set(id, { objectId: cita.clienteId, nombre: nombreClienteDe(cita), visitas: 0, gasto: 0 });
        }
        const cliente = porCliente.get(id);
        cliente.visitas++;
        cliente.gasto += precioDe(cita);
    }

    const noPresentadosPorCliente = new Map();
    for (const cita of citas) {
        if (cita.estado !== "no_presentada") continue;
        const nombre = nombreClienteDe(cita);
        const clave = cita.clienteId ? cita.clienteId.toString() : `manual:${nombre}`;
        if (!noPresentadosPorCliente.has(clave)) noPresentadosPorCliente.set(clave, { nombre, noPresentadas: 0 });
        noPresentadosPorCliente.get(clave).noPresentadas++;
    }

    const recurrentes = await getClientesConCitasAnteriores(
        barberiaId,
        [...porCliente.values()].map(c => c.objectId),
        desde
    );

    const top = [...porCliente.values()]
        .sort((a, b) => b.visitas - a.visitas || b.gasto - a.gasto)
        .slice(0, 5)
        .map(({ nombre, visitas, gasto }) => ({ nombre, visitas, gasto: redondear(gasto) }));

    return {
        unicos: porCliente.size,
        nuevos: porCliente.size - recurrentes.length,
        recurrentes: recurrentes.length,
        reservasManuales: atendibles.filter(c => !c.clienteId).length,
        top,
        masNoPresentados: [...noPresentadosPorCliente.values()]
            .sort((a, b) => b.noPresentadas - a.noPresentadas)
            .slice(0, 5)
    };
};

// Lo que se debe: citas completadas que aún no se han cobrado
const calcularDeudas = (citas, porBarbero) => {
    const nombreBarbero = new Map(porBarbero.map(b => [b.id, b.nombre]));
    const porCliente = new Map();

    for (const cita of citas) {
        if (cita.estado !== "completada" || cita.pagado) continue;
        const nombre = nombreClienteDe(cita);
        const clave = cita.clienteId ? cita.clienteId.toString() : `manual:${nombre}`;
        if (!porCliente.has(clave)) porCliente.set(clave, { clave, nombre, registrado: Boolean(cita.clienteId), total: 0, citas: [] });
        const deudor = porCliente.get(clave);
        deudor.total += precioDe(cita);
        deudor.citas.push({
            id: cita._id.toString(),
            fecha: cita.fecha,
            horaInicio: cita.horaInicio,
            servicio: cita.servicioNombre || "Servicio",
            barbero: nombreBarbero.get(cita.barberoId?.toString()) || "Antiguo empleado",
            importe: redondear(precioDe(cita))
        });
    }

    const clientes = [...porCliente.values()]
        .map(d => ({ ...d, total: redondear(d.total), citas: d.citas.sort((a, b) => (a.fecha + a.horaInicio).localeCompare(b.fecha + b.horaInicio)) }))
        .sort((a, b) => b.total - a.total);

    return {
        total: redondear(clientes.reduce((suma, d) => suma + d.total, 0)),
        clientes
    };
};

const calcularTopServicios = (citas) => {
    const porServicio = new Map();
    for (const cita of citas) {
        if (!esAtendible(cita)) continue;
        const clave = cita.servicioId?.toString() || cita.servicioNombre;
        if (!porServicio.has(clave)) porServicio.set(clave, { nombre: cita.servicioNombre || "Servicio", citas: 0, ingresos: 0 });
        const servicio = porServicio.get(clave);
        servicio.citas++;
        servicio.ingresos += precioDe(cita);
    }
    return [...porServicio.values()]
        .sort((a, b) => b.citas - a.citas || b.ingresos - a.ingresos)
        .slice(0, 5)
        .map(s => ({ ...s, ingresos: redondear(s.ingresos) }));
};

// Analíticas de ganancias y clientes de una barbería (solo su admin)
export const getAnaliticasBarberia = async (req, res) => {
    try {
        const { barberiaId } = req.params;
        const periodo = req.query.periodo ?? "mes";
        const fechaTexto = req.query.fecha ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });

        if (typeof periodo !== "string" || !PERIODOS_ANALITICA.includes(periodo)) {
            return res.status(400).json({ error: "Periodo no válido. Usa dia, semana o mes" });
        }
        const base = typeof fechaTexto === "string" ? parsearFecha(fechaTexto) : null;
        if (!base) {
            return res.status(400).json({ error: "Fecha no válida. Usa el formato YYYY-MM-DD" });
        }

        const isAdmin = await isUserAdminOfBarberia(req.user.id, barberiaId);
        if (!isAdmin) {
            return res.status(403).json({ error: "No tienes permiso para ver las analíticas de esta barbería" });
        }

        const { desde, hasta } = calcularRango(periodo, base);
        const anterior = calcularRangoAnterior(periodo, desde);
        const desdeTexto = formatearFecha(desde);

        const [citas, citasAnteriores, barberos] = await Promise.all([
            getCitasBarberiaEnRango(barberiaId, desdeTexto, formatearFecha(hasta)),
            getCitasBarberiaEnRango(barberiaId, formatearFecha(anterior.desde), formatearFecha(anterior.hasta)),
            getBarberosByBarberiaId(barberiaId)
        ]);

        const resumenAnterior = resumirCitas(citasAnteriores);
        const porBarbero = desglosarPorBarbero(citas, barberos);

        res.json({
            periodo,
            desde: desdeTexto,
            hasta: formatearFecha(hasta),
            resumen: resumirCitas(citas),
            anterior: {
                citas: resumenAnterior.citas,
                ingresosEsperados: resumenAnterior.ingresosEsperados,
                ingresosReales: resumenAnterior.ingresosReales,
                tasaNoPresentadas: resumenAnterior.tasaNoPresentadas
            },
            serie: construirSerie(periodo, desde, hasta, citas),
            porBarbero,
            deudas: calcularDeudas(citas, porBarbero),
            clientes: await analizarClientes(barberiaId, citas, desdeTexto),
            topServicios: calcularTopServicios(citas)
        });
    } catch (error) {
        console.error("Error al obtener analíticas de barbería:", error);
        res.status(500).json({ error: "Error al obtener analíticas" });
    }
};
