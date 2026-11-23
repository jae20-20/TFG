// Edición de citas por el personal. Devuelve { status, error } o el resultado: el controlador solo lo traduce a HTTP
import { getBarbershopById } from "../models/barbershopModel.js";
import {
    AVISO_CITA_MODIFICADA,
    ESTADOS_EDITABLES,
    getCitaById,
    getCitasByBarberoAndFecha,
    moverCita
} from "../models/citaModel.js";
import { barberoActivo, getUserById } from "../models/userModel.js";
import {
    INTERVALO_HUECOS_MIN,
    calcularDisponibilidad,
    calcularHoraFin,
    describirEstado,
    haEmpezado,
    momentoActual,
    relacionConCita,
    resolverServicios
} from "./citaReglas.js";

export const MENSAJE_BARBERO_INACTIVO = "Este barbero no admite citas nuevas en este momento";
const MENSAJE_NO_DISPONIBLE = "El barbero no está disponible en ese horario";

export const AVISOS_BARBERO = {
    modificada: "modificada",
    entrante: "reasignada_entrante",
    saliente: "reasignada_saliente"
};

const fallo = (status, error) => ({ status, error });

// Una cita ajena responde igual que una que no existe
const NO_ENCONTRADA = fallo(404, "Cita no encontrada");

const cargarCitaDelPersonal = async (citaId, userId) => {
    const cita = await getCitaById(citaId);
    if (!cita) return { fallo: NO_ENCONTRADA };
    const { esBarbero, esAdmin } = await relacionConCita(userId, cita);
    if (!esBarbero && !esAdmin) return { fallo: NO_ENCONTRADA };
    return { cita, esAdmin };
};

const motivoNoEditable = (cita) => {
    if (!ESTADOS_EDITABLES.includes(cita.estado)) return `No se puede modificar una cita ${describirEstado(cita.estado)}`;
    if (haEmpezado(cita)) return "No se puede modificar una cita que ya ha empezado o ha pasado";
    return null;
};

const cargarBarbero = async (cita, barberoId, cambia) => {
    const barbero = await getUserById(barberoId);
    if (!barbero || barbero.barberiaId?.toString() !== cita.barberiaId.toString()) {
        return { fallo: fallo(404, "Barbero no encontrado en esta barbería") };
    }
    if (cambia && !barberoActivo(barbero)) return { fallo: fallo(409, MENSAJE_BARBERO_INACTIVO) };
    return { barbero };
};

// Las citas antiguas solo tienen los campos de resumen, sin la lista de servicios
const serviciosDeLaCita = (cita) => (cita.servicios?.length
    ? cita.servicios
    : [{ _id: cita.servicioId, nombre: cita.servicioNombre, precio: Number(cita.servicioPrecio) || 0, duracion: Number(cita.servicioDuracion) || INTERVALO_HUECOS_MIN }]);

const mismosIds = (servicios, ids) =>
    servicios.length === ids.length && servicios.every((s, i) => s._id?.toString() === ids[i].toLowerCase());

const duracionDe = (cita) => Number(cita.servicioDuracion) || serviciosDeLaCita(cita).reduce((total, s) => total + (Number(s.duracion) || 0), 0);

const ocupadasSinLaCita = async (barberoId, fecha, cita) =>
    (await getCitasByBarberoAndFecha(barberoId, fecha)).filter((c) => !c._id.equals(cita._id));

// Quien hace el cambio no se avisa a sí mismo
const construirAvisos = ({ cita, userId, esAdmin, barberoNuevoId, ahora }) => {
    const anterior = { fecha: cita.fecha, horaInicio: cita.horaInicio };
    const barberoAnteriorId = cita.barberoId.toString();
    const extra = {};
    if (cita.clienteId) extra.avisoCliente = { tipo: AVISO_CITA_MODIFICADA, creadoEn: ahora, anterior };

    const destinatarios = new Map();
    if (barberoNuevoId !== barberoAnteriorId) {
        destinatarios.set(barberoAnteriorId, AVISOS_BARBERO.saliente);
        destinatarios.set(barberoNuevoId, AVISOS_BARBERO.entrante);
    } else if (esAdmin) {
        destinatarios.set(barberoAnteriorId, AVISOS_BARBERO.modificada);
    }
    destinatarios.delete(userId);

    if (destinatarios.size > 0) {
        // El aviso nuevo sustituye al que el barbero tuviera sin ver en esta cita
        const previos = (cita.avisosBarbero || []).filter((a) => !destinatarios.has(a.barberoId?.toString()));
        extra.avisosBarbero = [
            ...previos,
            ...[...destinatarios].map(([barberoId, tipo]) => ({ barberoId, tipo, creadoEn: ahora, anterior }))
        ];
    }
    return extra;
};

const sinAvisosBarbero = ({ avisosBarbero, ...cita }) => cita;

export const editarCita = async ({ citaId, userId, cambios }) => {
    const cargada = await cargarCitaDelPersonal(citaId, userId);
    if (cargada.fallo) return cargada.fallo;
    const { cita, esAdmin } = cargada;

    const barberoActualId = cita.barberoId.toString();
    const barberoId = cambios.barberoId?.toLowerCase() ?? barberoActualId;
    const cambiaBarbero = barberoId !== barberoActualId;
    if (cambiaBarbero && !esAdmin) {
        return fallo(403, "Solo el dueño de la barbería puede cambiar el barbero de una cita");
    }

    const motivo = motivoNoEditable(cita);
    if (motivo) return fallo(409, motivo);

    const [barberia, { barbero, fallo: falloBarbero }] = await Promise.all([
        getBarbershopById(cita.barberiaId.toString()),
        cargarBarbero(cita, barberoId, cambiaBarbero)
    ]);
    if (falloBarbero) return falloBarbero;
    if (!barberia) return NO_ENCONTRADA;

    // Sin servicios nuevos se conserva la duración de la cita: el arrastre solo cambia el inicio
    let servicios = serviciosDeLaCita(cita);
    let resumen = null;
    if (cambios.servicioIds !== undefined && !mismosIds(servicios, cambios.servicioIds)) {
        const resueltos = resolverServicios(barberia, { servicioIds: cambios.servicioIds });
        if (resueltos.error) return fallo(resueltos.status || 400, resueltos.error);
        ({ servicios, resumen } = resueltos);
    }

    if (cambiaBarbero || resumen) {
        const bloqueado = servicios.find((s) => (barbero.serviciosBloqueados || []).includes(s._id?.toString()));
        if (bloqueado) return fallo(400, `Este barbero no realiza el servicio ${bloqueado.nombre}`);
    }

    const fecha = cambios.fecha ?? cita.fecha;
    const horaInicio = cambios.horaInicio ?? cita.horaInicio;
    const ahora = momentoActual();
    if (fecha < ahora.fecha || (fecha === ahora.fecha && horaInicio <= ahora.hora)) {
        return fallo(400, "No se puede mover una cita a una fecha u hora pasada");
    }

    const duracion = resumen ? resumen.servicioDuracion : duracionDe(cita);
    const horaFin = calcularHoraFin(horaInicio, duracion);
    if (!horaFin) return fallo(400, "Los servicios elegidos no caben en ese día");

    if (!cambiaBarbero && !resumen && fecha === cita.fecha && horaInicio === cita.horaInicio) {
        return { cita: sinAvisosBarbero(cita), sinCambios: true };
    }

    // Mismas reglas que una reserva nueva, sin contar la propia cita
    const ocupadas = await ocupadasSinLaCita(barberoId, fecha, cita);
    const { horariosDisponibles } = calcularDisponibilidad(barberia, barbero, fecha, ocupadas, { duracion });
    if (!horariosDisponibles.includes(horaInicio)) return fallo(409, MENSAJE_NO_DISPONIBLE);

    const datos = { fecha, horaInicio, horaFin, barberoId };
    if (resumen) {
        Object.assign(datos, resumen, { servicios });
        // Un cobro ya registrado se respeta
        if (!cita.pagado) datos.importePagado = resumen.servicioPrecio;
    }
    const avisos = construirAvisos({ cita, userId, esAdmin, barberoNuevoId: barberoId, ahora: new Date() });

    const resultado = await moverCita(cita, datos, avisos);
    if (resultado.motivo === "ocupado") return fallo(409, MENSAJE_NO_DISPONIBLE);
    if (resultado.motivo === "cambiada") return fallo(409, "La cita ha cambiado mientras tanto. Recarga e inténtalo de nuevo");
    return { cita: sinAvisosBarbero(resultado.cita) };
};

export const huecosParaEdicion = async ({ citaId, userId, fecha, barberoId: barberoPedido, duracion }) => {
    const cargada = await cargarCitaDelPersonal(citaId, userId);
    if (cargada.fallo) return cargada.fallo;
    const { cita, esAdmin } = cargada;

    const barberoId = barberoPedido?.toLowerCase() ?? cita.barberoId.toString();
    const cambiaBarbero = barberoId !== cita.barberoId.toString();
    if (cambiaBarbero && !esAdmin) {
        return fallo(403, "Solo el dueño de la barbería puede cambiar el barbero de una cita");
    }

    const motivo = motivoNoEditable(cita);
    if (motivo) return fallo(409, motivo);

    const [barberia, { barbero, fallo: falloBarbero }] = await Promise.all([
        getBarbershopById(cita.barberiaId.toString()),
        cargarBarbero(cita, barberoId, cambiaBarbero)
    ]);
    if (falloBarbero) return falloBarbero;
    if (!barberia) return NO_ENCONTRADA;

    if (fecha < momentoActual().fecha) {
        return { huecos: { fecha, barberoId, estado: "pasado", horariosDisponibles: [] } };
    }

    const ocupadas = await ocupadasSinLaCita(barberoId, fecha, cita);
    const { estado, horariosDisponibles } = calcularDisponibilidad(barberia, barbero, fecha, ocupadas, { duracion: duracion ?? duracionDe(cita) });
    return { huecos: { fecha, barberoId, estado, horariosDisponibles } };
};
