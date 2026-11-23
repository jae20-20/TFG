// Reglas de citas compartidas por la reserva, la cita manual, la disponibilidad y la edición
import { MAX_SERVICIOS_CITA, esObjectIdValido } from "../middleware/validateMiddleware.js";
import { isUserAdminOfBarberia } from "../models/barbershopModel.js";
import { getUserById } from "../models/userModel.js";

// Duración de cada hueco de la agenda; también es cuánto puede llevar empezada una cita manual (cliente que llega sin reserva)
export const INTERVALO_HUECOS_MIN = 30;

const NOMBRE_ESTADO = {
    pendiente: "pendiente",
    confirmada: "confirmada",
    completada: "completada",
    no_presentada: "no presentada",
    cancelada: "cancelada"
};

export const describirEstado = (estado) => NOMBRE_ESTADO[estado] || estado;

// Fecha "YYYY-MM-DD" y hora "HH:MM" actuales en Madrid
export const momentoActual = () => {
    const ahora = new Date();
    return {
        fecha: ahora.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }),
        hora: ahora.toLocaleTimeString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false })
    };
};

export const haEmpezado = (cita) => {
    const { fecha, hora } = momentoActual();
    return cita.fecha < fecha || (cita.fecha === fecha && cita.horaInicio <= hora);
};

// Relación del usuario con la cita según la BD; un barbero que ya dejó la barbería pierde el acceso
export const relacionConCita = async (userId, cita) => {
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
export const calcularHoraFin = (horaInicio, duracion) => {
    const [horas, minutos] = horaInicio.split(":").map(Number);
    const totalMinutos = horas * 60 + minutos + duracion;
    if (totalMinutos >= 24 * 60) return null;
    return `${String(Math.floor(totalMinutos / 60)).padStart(2, "0")}:${String(totalMinutos % 60).padStart(2, "0")}`;
};

const aMinutos = (hora) => {
    const [h, m] = hora.split(":").map(Number);
    return h * 60 + m;
};

// Servicios de la cita en el orden elegido (el primero es el principal), sacados de la BD de la barbería.
// Acepta servicioIds (lista) o el antiguo servicioId. Devuelve la lista y los campos de resumen
// (nombre combinado, precio y duración sumados) que usan calendario, reseñas y estadísticas
export const resolverServicios = (barberia, { servicioIds, servicioId }) => {
    const ids = servicioIds !== undefined ? servicioIds : (servicioId !== undefined ? [servicioId] : []);
    if (!Array.isArray(ids) || ids.length === 0) {
        return { error: "Elige al menos un servicio" };
    }
    if (ids.length > MAX_SERVICIOS_CITA) {
        return { error: `Puedes elegir como máximo ${MAX_SERVICIOS_CITA} servicios por cita` };
    }
    if (!ids.every(esObjectIdValido)) {
        return { error: "Identificador no válido" };
    }
    const normalizados = ids.map((id) => id.toLowerCase());
    if (new Set(normalizados).size !== normalizados.length) {
        return { error: "No repitas un servicio en la misma cita" };
    }

    const encontrados = normalizados.map((id) => (barberia.servicios || []).find((s) => s._id?.toString() === id));
    if (encontrados.some((s) => !s)) {
        return { error: "Servicio no encontrado", status: 404 };
    }

    const servicios = encontrados.map((s) => ({
        _id: s._id,
        nombre: s.nombre,
        precio: Number(s.precio) || 0,
        duracion: Number(s.duracion) || INTERVALO_HUECOS_MIN
    }));
    return { servicios, resumen: resumirServicios(servicios) };
};

export const resumirServicios = (servicios) => ({
    servicioId: servicios[0]._id.toString(),
    servicioNombre: servicios.map((s) => s.nombre).join(" + "),
    servicioPrecio: Math.round(servicios.reduce((total, s) => total + s.precio, 0) * 100) / 100,
    servicioDuracion: servicios.reduce((total, s) => total + s.duracion, 0)
});

// "HH:MM" menos unos minutos, sin bajar de "00:00"
export const restarMinutos = (hora, minutos) => {
    const [h, m] = hora.split(":").map(Number);
    const total = Math.max(0, h * 60 + m - minutos);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

// Horas de inicio en las que cabe una cita de "duracion" minutos: dentro de una franja abierta y sin
// pisar otras citas ni ausencias del barbero. incluirEnCurso añade el hueco que ya empezó (citas manuales)
export const calcularDisponibilidad = (barberia, barbero, fecha, citasOcupadas, { incluirEnCurso = false, duracion = INTERVALO_HUECOS_MIN } = {}) => {
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

    // 1. Horario base de la barbería. Las excepciones se guardan planas, una por franja:
    // closed (cierra el día), custom (franja abierta que sustituye a la plantilla) y block (horas bloqueadas)
    const excepcionesDia = (schedule.exceptions || []).filter(e => e.date === fecha);
    const franjasEspeciales = excepcionesDia
        .filter(e => e.type === 'custom' && e.start && e.end)
        .map(e => ({ start: e.start, end: e.end }))
        .sort((a, b) => a.start.localeCompare(b.start));
    const bloqueosBarberia = excepcionesDia
        .filter(e => e.type === 'block' && e.start && e.end)
        .map(e => ({ start: e.start, end: e.end }));

    if (excepcionesDia.some(e => e.type === 'closed')) {
        isBarberiaClosed = true;
    } else if (franjasEspeciales.length > 0) {
        slotsForDay = franjasEspeciales;
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
    const enVacaciones = (barbero.vacaciones || []).some(v => v?.fechaInicio && v?.fechaFin && fecha >= v.fechaInicio && fecha <= v.fechaFin);
    const hasClosedException = barberExceptions.some(ex => ex.type === 'closed' || (ex.isAbsence === true && !ex.start));

    if (customOpeningSlots.length > 0) {
        // Si el barbero tiene franjas específicas abiertas para este día (ej: abiertas por el admin)
        slotsForDay = customOpeningSlots.map(s => ({ start: s.start, end: s.end }));
        isBarberiaClosed = false;
        isBarberoClosed = false;
    } else if (hasClosedException || (barbero.diasLibres && barbero.diasLibres.includes(fecha)) || enVacaciones) {
        // Si no tiene franjas abiertas explícitas y el día está en días libres, vacaciones o cerrado
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

    const pisa = (inicio, fin, desde, hasta) => inicio < aMinutos(hasta) && fin > aMinutos(desde);

    for (const slot of slotsForDay) {
        if (!slot.start || !slot.end) continue;
        const finFranja = aMinutos(slot.end);

        for (let inicio = aMinutos(slot.start); inicio + duracion <= finFranja; inicio += INTERVALO_HUECOS_MIN) {
            const fin = inicio + duracion;
            const ocupado = citasOcupadas.some((cita) => pisa(inicio, fin, cita.horaInicio, cita.horaFin));
            const enAusencia = absenceSlots.some((abs) => pisa(inicio, fin, abs.start, abs.end))
                || bloqueosBarberia.some((blq) => pisa(inicio, fin, blq.start, blq.end));
            if (!ocupado && !enAusencia) {
                horariosDisponibles.push(`${String(Math.floor(inicio / 60)).padStart(2, "0")}:${String(inicio % 60).padStart(2, "0")}`);
            }
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
