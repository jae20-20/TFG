//manejar http request - Citas
import { registrarError } from "../utils/registrarError.js";
import { responderErrorInterno } from "../middleware/errorMiddleware.js";
import {
    AVISO_RESPUESTA_RESENA,
    createCita,
    crearRespuestaResena,
    editarRespuestaResena,
    eliminarRespuestaResena,
    getCitaById,
    getCitasBarberiaEnRango,
    getCitasByBarberiaId,
    getCitasByBarberoAndFecha,
    getCitasByBarberoEnRango,
    getCitasByBarberoId,
    getCitasByClienteId,
    getAvisosBarbero,
    getClientesConCitasAnteriores,
    getResenasByBarberiaId,
    quitarAvisosBarbero,
    quitarAvisosCliente,
    setResenaCita,
    transicionarCita,
    updateCitaPago
} from "../models/citaModel.js";

import {
    MAX_CARACTERES_NOMBRE_CLIENTE,
    MAX_CARACTERES_RESENA,
    MENSAJE_CLIENTE_NO_ENCONTRADO,
    correoClienteIndicado,
    errorCuerpoNoObjeto,
    errorImagen,
    errorTextoRespuesta,
    esObjectIdValido,
    validarCorreo
} from "../middleware/validateMiddleware.js";
import { getBarberiaByAdminId, getBarberosByBarberiaId, getBarbershopById, isUserAdminOfBarberia } from "../models/barbershopModel.js";
import { barberoActivo, getClienteIdPorCorreo, getUserById, normalizarCorreo } from "../models/userModel.js";
import {
    INTERVALO_HUECOS_MIN,
    calcularDisponibilidad,
    calcularHoraFin,
    describirEstado,
    haEmpezado,
    momentoActual,
    relacionConCita,
    resolverServicios,
    restarMinutos
} from "../services/citaReglas.js";
import { RE_FECHA, RE_HORA, esFechaValida } from "../middleware/validateMiddleware.js";
import { MENSAJE_BARBERO_INACTIVO, editarCita as editarCitaServicio, huecosParaEdicion } from "../services/editarCitaService.js";

const RE_MES = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

// Plazo para aceptar o rechazar una reserva cuando la barbería confirma manualmente
const PLAZO_RESPUESTA_MS = 24 * 60 * 60 * 1000;

// Duración máxima que se acepta al consultar la disponibilidad
const MAX_DURACION_CITA_MIN = 12 * 60;
// Hasta cuántos meses por delante se consultan los días con hueco
const MAX_MESES_ADELANTE = 12;

// Duración orientativa de la consulta (minutos); null si no es válida. Sin valor, un hueco
const leerDuracion = (valor) => {
    const duracion = valor === undefined ? INTERVALO_HUECOS_MIN : Number(valor);
    return Number.isInteger(duracion) && duracion >= 5 && duracion <= MAX_DURACION_CITA_MIN ? duracion : null;
};

// "YYYY-MM" desplazado n meses
const sumarMeses = (mes, n) => {
    const [anio, numero] = mes.split("-").map(Number);
    const fecha = new Date(Date.UTC(anio, numero - 1 + n, 1));
    return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`;
};

// Estado destino -> estados de origen permitidos; cancelada, completada y no_presentada son finales
const TRANSICIONES = {
    confirmada: ["pendiente"],
    completada: ["confirmada"],
    no_presentada: ["confirmada"],
    cancelada: ["pendiente", "confirmada"]
};

//CREAR CITA (CLIENTE)

export const crearCita = async (req, res) => {
    try {
        const clienteId = req.user.id;
        const { barberiaId, barberoId, fecha, horaInicio, comentario } = req.body;

        // Validar campos obligatorios (los servicios se validan en resolverServicios)
        if (!barberiaId || !barberoId || !fecha || !horaInicio) {
            return res.status(400).json({ error: "Todos los campos son obligatorios" });
        }

        if (![barberiaId, barberoId].every(esObjectIdValido)) {
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

        const { servicios, resumen, error: errorServicios, status: statusServicios } = resolverServicios(barberia, req.body);
        if (errorServicios) {
            return res.status(statusServicios || 400).json({ error: errorServicios });
        }

        // Verificar que el barbero existe y pertenece a la barbería
        const barbero = await getUserById(barberoId);
        if (!barbero || barbero.barberiaId?.toString() !== barberiaId) {
            return res.status(404).json({ error: "Barbero no encontrado en esta barbería" });
        }
        if (!barberoActivo(barbero)) {
            return res.status(409).json({ error: MENSAJE_BARBERO_INACTIVO });
        }

        const bloqueado = servicios.find((s) => (barbero.serviciosBloqueados || []).includes(s._id.toString()));
        if (bloqueado) {
            return res.status(400).json({ error: `Este barbero no realiza el servicio ${bloqueado.nombre}` });
        }

        // Validar que no se reserve en el pasado
        const ahora = momentoActual();
        if (fecha < ahora.fecha) {
            return res.status(400).json({ error: "No se pueden crear citas en fechas pasadas" });
        }
        if (fecha === ahora.fecha && horaInicio <= ahora.hora) {
            return res.status(400).json({ error: "No se pueden crear citas en horarios que ya han pasado" });
        }

        const horaFin = calcularHoraFin(horaInicio, resumen.servicioDuracion);
        if (!horaFin) {
            return res.status(400).json({ error: "Los servicios elegidos no caben en ese día" });
        }

        // La hora debe ser uno de los huecos que se ofrecen para la duración total (horario abierto, sin ausencias ni otras citas)
        const citasDelDia = await getCitasByBarberoAndFecha(barberoId, fecha);
        const { horariosDisponibles } = calcularDisponibilidad(barberia, barbero, fecha, citasDelDia, { duracion: resumen.servicioDuracion });
        if (!horariosDisponibles.includes(horaInicio)) {
            return res.status(409).json({ error: "El barbero no está disponible en ese horario" });
        }

        const requiereAprobacion = barberia.modoConfirmacion === "manual";

        const nuevaCita = await createCita({
            clienteId,
            barberoId,
            barberiaId,
            fecha,
            horaInicio,
            horaFin,
            ...resumen,
            servicios,
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
                servicio: resumen.servicioNombre,
                precio: resumen.servicioPrecio,
                barberia: barberia.nombre,
                estado: nuevaCita.estado,
                expiraEn: nuevaCita.expiraEn ?? null
            }
        });

    } catch (error) {
        registrarError("Error al crear cita:", error);
        responderErrorInterno(res, error, "Error al crear cita");
    }
};

// Nombre libre de la cita manual: opcional, solo texto. Devuelve { nombre } o { error }
const leerNombreCliente = (valor) => {
    if (valor === undefined || valor === null) return { nombre: "" };
    if (typeof valor !== "string") return { error: "El nombre del cliente debe ser texto" };
    const nombre = valor.trim();
    return nombre.length > MAX_CARACTERES_NOMBRE_CLIENTE
        ? { error: `El nombre del cliente no puede superar los ${MAX_CARACTERES_NOMBRE_CLIENTE} caracteres` }
        : { nombre };
};

// Correo del cliente al que se asigna la cita, normalizado. Devuelve { correo } (null si no se indicó) o { error }
const leerCorreoCliente = (body) => {
    if (!correoClienteIndicado(body)) return { correo: null };
    if (typeof body.correoCliente !== "string") return { error: "El correo del cliente debe ser texto" };
    const correo = normalizarCorreo(body.correoCliente);
    const error = validarCorreo(correo);
    return error ? { error } : { correo };
};

// CREAR CITA MANUAL (ADMIN O BARBERO)
// Con correoCliente la cita queda asignada a esa cuenta de cliente (le aparece en «Mis citas» y recibe un aviso);
// sin él, es una cita con solo el nombre, como las de quien reserva por teléfono o en persona
export const crearCitaManual = async (req, res) => {
    try {
        const userId = req.user.id;
        const userRol = req.user.rol;
        const { barberoId, fecha, horaInicio } = req.body;

        if (!barberoId || !fecha || !horaInicio) {
            return res.status(400).json({ error: "Barbero, servicio, fecha y hora son obligatorios" });
        }

        if (!esObjectIdValido(barberoId)) {
            return res.status(400).json({ error: "Identificador no válido" });
        }

        if (!RE_FECHA.test(fecha) || !RE_HORA.test(horaInicio)) {
            return res.status(400).json({ error: "Formato de fecha u hora no válido" });
        }

        const { nombre: clienteNombre, error: errorNombre } = leerNombreCliente(req.body.clienteNombre);
        const { correo: correoCliente, error: errorCorreo } = leerCorreoCliente(req.body);
        if (errorNombre || errorCorreo) {
            return res.status(400).json({ error: errorNombre || errorCorreo });
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

        if (!barberoActivo(barbero)) {
            return res.status(409).json({ error: MENSAJE_BARBERO_INACTIVO });
        }

        const barberia = await getBarbershopById(barberiaId);
        const { servicios, resumen, error: errorServicios, status: statusServicios } = resolverServicios(barberia || {}, req.body);
        if (errorServicios) {
            return res.status(statusServicios || 400).json({ error: errorServicios });
        }

        // Validar que no se reserve en el pasado
        const ahora = momentoActual();
        if (fecha < ahora.fecha) {
            return res.status(400).json({ error: "No se pueden crear citas en fechas pasadas" });
        }
        if (fecha === ahora.fecha && horaInicio <= restarMinutos(ahora.hora, INTERVALO_HUECOS_MIN)) {
            return res.status(400).json({ error: `Solo se pueden registrar citas que empezaron hace menos de ${INTERVALO_HUECOS_MIN} minutos` });
        }

        const horaFin = calcularHoraFin(horaInicio, resumen.servicioDuracion);
        if (!horaFin) {
            return res.status(400).json({ error: "Los servicios elegidos no caben en ese día" });
        }

        // La búsqueda va al final, cuando el permiso y el resto de datos ya son válidos: solo el personal autorizado
        // puede comprobar un correo, y un 404 nunca deja una cita a medias
        let clienteId = null;
        if (correoCliente) {
            clienteId = await getClienteIdPorCorreo(correoCliente);
            if (!clienteId) {
                return res.status(404).json({ error: MENSAJE_CLIENTE_NO_ENCONTRADO });
            }
        }

        // Asignada a un cliente es como una reserva suya (sin clienteNombre, el nombre sale de su cuenta) y le deja un aviso
        const datosCliente = clienteId
            ? { clienteId, avisoCliente: { tipo: "nueva", creadoEn: new Date() } }
            : { clienteId: null, clienteNombre: clienteNombre || "Reserva manual" };

        // Misma transacción y comprobación de solape que la reserva del cliente (createCita)
        const nuevaCita = await createCita({
            ...datosCliente,
            barberoId,
            barberiaId,
            fecha,
            horaInicio,
            horaFin,
            ...resumen,
            servicios,
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
                servicio: resumen.servicioNombre,
                precio: resumen.servicioPrecio,
                // Asignada a una cuenta no se devuelve ningún dato del cliente; solo que quedó vinculada
                clienteVinculado: Boolean(clienteId),
                ...(!clienteId && { clienteNombre: datosCliente.clienteNombre }),
                estado: "confirmada"
            }
        });
    } catch (error) {
        registrarError("Error al crear cita manual:", error);
        responderErrorInterno(res, error, "Error al crear cita manual");
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
        registrarError("Error al obtener citas:", error);
        responderErrorInterno(res, error, "Error al obtener citas");
    }
};

// Obtener citas del barbero
export const getCitasBarbero = async (req, res) => {
    try {
        const barberoId = req.user.id;
        // La barbería actual sale de la BD (el token puede estar obsoleto): al dejarla, el barbero pierde sus citas anteriores
        const barbero = await getUserById(barberoId);
        if (!barbero?.barberiaId) return res.json([]);
        const citas = await getCitasByBarberoId(barberoId, barbero.barberiaId);
        res.json(citas);
    } catch (error) {
        registrarError("Error al obtener citas:", error);
        responderErrorInterno(res, error, "Error al obtener citas");
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
        registrarError("Error al obtener citas de barbería:", error);
        responderErrorInterno(res, error, "Error al obtener citas");
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

        res.json(sinAutorRespuesta(cita));
    } catch (error) {
        registrarError("Error al obtener cita:", error);
        responderErrorInterno(res, error, "Error al obtener cita");
    }
};

//  ACTUALIZAR ESTADO DE CITA

// Acciones reservadas al barbero asignado o al admin de la barbería de la cita
// Aviso para el cliente (RF12) cuando el personal cambia el estado de su reserva; las citas manuales no tienen cliente
const avisoPara = (cita, tipo) => (tipo && cita.clienteId ? { avisoCliente: { tipo, creadoEn: new Date() } } : {});

const accionDelPersonal = ({ origenes, destino, verbo, campos = {}, aviso, comprobarMomento, mensaje }) => async (req, res) => {
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

        const citaActualizada = await transicionarCita(id, [cita.estado], destino, { ...campos, ...avisoPara(cita, aviso) });
        if (!citaActualizada) {
            return res.status(409).json({ error: "La cita ha cambiado mientras tanto. Recarga e inténtalo de nuevo" });
        }

        res.json({ message: mensaje, cita: citaActualizada });
    } catch (error) {
        registrarError(`Error al ${verbo} cita:`, error);
        responderErrorInterno(res, error, `Error al ${verbo} cita`);
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
    aviso: "confirmada",
    comprobarMomento: reservaCaducada,
    mensaje: "Reserva aceptada"
});

// Rechazar una reserva pendiente
export const rechazarCita = accionDelPersonal({
    origenes: ["pendiente"],
    destino: "cancelada",
    verbo: "rechazar",
    campos: { motivoCancelacion: "rechazada" },
    aviso: "rechazada",
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

        // Solo se avisa al cliente cuando la cancelación no la hace él mismo
        const citaActualizada = await transicionarCita(id, [cita.estado], "cancelada", {
            motivoCancelacion: esPersonal ? "barberia" : "cliente",
            ...(esPersonal && avisoPara(cita, "cancelada"))
        });
        if (!citaActualizada) {
            return res.status(409).json({ error: "La cita ha cambiado mientras tanto. Recarga e inténtalo de nuevo" });
        }

        res.json({ message: "Cita cancelada correctamente", cita: citaActualizada });
    } catch (error) {
        registrarError("Error al cancelar cita:", error);
        responderErrorInterno(res, error, "Error al cancelar cita");
    }
};

// El cliente da por vistos todos sus avisos. El filtro usa el id del token, nunca uno recibido en la petición
export const marcarAvisosLeidos = async (req, res) => {
    try {
        const { modifiedCount } = await quitarAvisosCliente(req.user.id);
        res.json({ message: "Avisos marcados como leídos", avisosLeidos: modifiedCount });
    } catch (error) {
        registrarError("Error al marcar los avisos como leídos:", error);
        responderErrorInterno(res, error, "Error al marcar los avisos como leídos");
    }
};

//  EDITAR CITA (DUEÑO O BARBERO)

export const editarCita = async (req, res) => {
    try {
        const { fecha, horaInicio, barberoId, servicioIds } = req.body;
        const resultado = await editarCitaServicio({
            citaId: req.params.id,
            userId: req.user.id,
            cambios: { fecha, horaInicio, barberoId, servicioIds }
        });
        if (resultado.error) {
            return res.status(resultado.status).json({ error: resultado.error });
        }
        res.json({
            message: resultado.sinCambios ? "La cita no tenía cambios" : "Cita modificada correctamente",
            cita: resultado.cita
        });
    } catch (error) {
        registrarError("Error al modificar cita:", error);
        responderErrorInterno(res, error, "Error al modificar la cita");
    }
};

export const getHuecosEdicion = async (req, res) => {
    try {
        const { fecha, barberoId } = req.query;
        if (!esFechaValida(fecha)) {
            return res.status(400).json({ error: "Fecha no válida. Usa el formato YYYY-MM-DD" });
        }
        if (barberoId !== undefined && !esObjectIdValido(barberoId)) {
            return res.status(400).json({ error: "Identificador de barbero no válido" });
        }
        const duracion = req.query.duracion === undefined ? undefined : leerDuracion(req.query.duracion);
        if (duracion === null) {
            return res.status(400).json({ error: "Duración no válida" });
        }

        const resultado = await huecosParaEdicion({ citaId: req.params.id, userId: req.user.id, fecha, barberoId, duracion });
        if (resultado.error) {
            return res.status(resultado.status).json({ error: resultado.error });
        }
        res.json(resultado.huecos);
    } catch (error) {
        registrarError("Error al obtener huecos para editar cita:", error);
        responderErrorInterno(res, error, "Error al obtener la disponibilidad");
    }
};

export const getAvisosBarberoAutenticado = async (req, res) => {
    try {
        res.json(await getAvisosBarbero(req.user.id));
    } catch (error) {
        registrarError("Error al obtener avisos del barbero:", error);
        responderErrorInterno(res, error, "Error al obtener los avisos");
    }
};

export const marcarAvisosBarberoLeidos = async (req, res) => {
    try {
        const { modifiedCount } = await quitarAvisosBarbero(req.user.id);
        res.json({ message: "Avisos marcados como leídos", avisosLeidos: modifiedCount });
    } catch (error) {
        registrarError("Error al marcar los avisos del barbero como leídos:", error);
        responderErrorInterno(res, error, "Error al marcar los avisos como leídos");
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

        const comentarioLimpio = typeof comentario === "string" ? comentario.trim().slice(0, MAX_CARACTERES_RESENA) : "";

        const errorFoto = errorImagen(imagen, "resena");
        if (errorFoto) {
            return res.status(400).json({ error: errorFoto });
        }
        const imagenLimpia = imagen || null;

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
        registrarError("Error al crear reseña:", error);
        responderErrorInterno(res, error, "Error al crear reseña");
    }
};

// RESPUESTAS A RESEÑAS

// El barbero solo cuenta como tal si sigue en esa barbería y está activo (un barbero desactivado no responde)
const esBarberoActivoDe = (usuario, barberiaId) =>
    usuario?.rol === "barbero" && usuario.barberiaId?.toString() === barberiaId && barberoActivo(usuario);

// Quién puede escribir la respuesta según la BD: el dueño de la barbería de la reseña, o el barbero que atendió
// la cita. null si ninguno. No se usan el rol ni la barbería del token
const autorPermitido = async (userId, cita) => {
    const barberiaId = cita.barberiaId.toString();
    if (await isUserAdminOfBarberia(userId, barberiaId)) return "admin";
    if (cita.barberoId?.toString() !== userId) return null;
    return esBarberoActivoDe(await getUserById(userId), barberiaId) ? "barbero" : null;
};

// El barbero solo gestiona sus propias respuestas; el dueño, todas las de su barbería
const puedeGestionarRespuesta = (autorRol, respuesta, userId) =>
    autorRol === "admin" || !respuesta || respuesta.autorId?.toString() === userId;

// Respuesta tal como se envía: sin autorId (el id del dueño no se publica)
const respuestaVisible = ({ texto, autorRol, createdAt, updatedAt }) => ({ texto, autorRol, createdAt, updatedAt });

const sinAutorRespuesta = (cita) => cita?.resena?.respuesta
    ? { ...cita, resena: { ...cita.resena, respuesta: respuestaVisible(cita.resena.respuesta) } }
    : cita;

// Comprobaciones comunes a crear, editar y borrar: reseña existente (404) y permiso (403).
// Devuelve { cita, autorRol } o null si ya ha respondido con el error
const cargarResenaParaResponder = async (req, res, accion) => {
    const cita = await getCitaById(req.params.id);
    if (!cita?.resena) {
        res.status(404).json({ error: "Reseña no encontrada" });
        return null;
    }
    const autorRol = await autorPermitido(req.user.id, cita);
    if (!autorRol) {
        res.status(403).json({ error: `No tienes permiso para ${accion} esta reseña` });
        return null;
    }
    return { cita, autorRol };
};

// Texto ya validado del cuerpo, o null si ha respondido con el 400
const leerTextoRespuesta = (req, res) => {
    const error = errorCuerpoNoObjeto(req.body) || errorTextoRespuesta(req.body.texto);
    if (error) {
        res.status(400).json({ error });
        return null;
    }
    return req.body.texto.trim();
};

// Responder una reseña (dueño de la barbería o barbero que atendió la cita); una sola respuesta por reseña
export const responderResena = async (req, res) => {
    try {
        const texto = leerTextoRespuesta(req, res);
        if (texto === null) return;

        const cargada = await cargarResenaParaResponder(req, res, "responder");
        if (!cargada) return;
        const { cita, autorRol } = cargada;

        if (cita.resena.respuesta) {
            return res.status(409).json({ error: "Esta reseña ya tiene una respuesta" });
        }

        const ahora = new Date();
        const respuesta = { texto, autorId: req.user.id, autorRol, createdAt: ahora, updatedAt: null };
        const guardada = await crearRespuestaResena(req.params.id, respuesta, avisoPara(cita, AVISO_RESPUESTA_RESENA));
        if (!guardada) {
            return res.status(409).json({ error: "Esta reseña ya tiene una respuesta" });
        }
        res.status(201).json({ message: "Respuesta publicada", respuesta: respuestaVisible(respuesta) });
    } catch (error) {
        registrarError("Error al responder reseña:", error);
        responderErrorInterno(res, error, "Error al responder la reseña");
    }
};

// Editar la respuesta: quien la escribió o el dueño de la barbería (que pasa a figurar como autor)
export const editarRespuesta = async (req, res) => {
    try {
        const texto = leerTextoRespuesta(req, res);
        if (texto === null) return;

        const cargada = await cargarResenaParaResponder(req, res, "editar la respuesta de");
        if (!cargada) return;
        const { cita, autorRol } = cargada;

        const actual = cita.resena.respuesta;
        if (!actual) {
            return res.status(404).json({ error: "Esta reseña no tiene respuesta" });
        }
        if (!puedeGestionarRespuesta(autorRol, actual, req.user.id)) {
            return res.status(403).json({ error: "Solo puedes editar tus propias respuestas" });
        }

        const soloDeAutor = autorRol === "admin" ? undefined : req.user.id;
        const respuesta = await editarRespuestaResena(req.params.id, { texto, autorId: req.user.id, autorRol }, { soloDeAutor });
        if (!respuesta) {
            return res.status(409).json({ error: "La respuesta ha cambiado mientras tanto. Recarga e inténtalo de nuevo" });
        }
        res.json({ message: "Respuesta actualizada", respuesta: respuestaVisible(respuesta) });
    } catch (error) {
        registrarError("Error al editar respuesta de reseña:", error);
        responderErrorInterno(res, error, "Error al editar la respuesta");
    }
};

// Borrar la respuesta: quien la escribió o el dueño de la barbería
export const eliminarRespuesta = async (req, res) => {
    try {
        const cargada = await cargarResenaParaResponder(req, res, "borrar la respuesta de");
        if (!cargada) return;
        const { cita, autorRol } = cargada;

        const actual = cita.resena.respuesta;
        if (!actual) {
            return res.status(404).json({ error: "Esta reseña no tiene respuesta" });
        }
        if (!puedeGestionarRespuesta(autorRol, actual, req.user.id)) {
            return res.status(403).json({ error: "Solo puedes borrar tus propias respuestas" });
        }

        const soloDeAutor = autorRol === "admin" ? undefined : req.user.id;
        const borrada = await eliminarRespuestaResena(req.params.id, { soloDeAutor });
        if (!borrada) {
            return res.status(409).json({ error: "La respuesta ha cambiado mientras tanto. Recarga e inténtalo de nuevo" });
        }
        res.json({ message: "Respuesta eliminada" });
    } catch (error) {
        registrarError("Error al borrar respuesta de reseña:", error);
        responderErrorInterno(res, error, "Error al borrar la respuesta");
    }
};

// Obtener las reseñas de la barbería del admin/barbero autenticado. Cada una lleva puedeResponder: si este usuario
// puede responderla (o editar y borrar su respuesta), con las mismas reglas que las rutas de respuesta
export const getResenasBarberia = async (req, res) => {
    try {
        const userId = req.user.id;

        let barberia = await getBarberiaByAdminId(userId);
        const esAdmin = Boolean(barberia);
        let usuario = null;
        if (!barberia) {
            usuario = await getUserById(userId);
            if (usuario && usuario.barberiaId) {
                barberia = await getBarbershopById(usuario.barberiaId.toString());
            }
        }

        if (!barberia) {
            return res.status(404).json({ error: "No tienes ninguna barbería asociada" });
        }

        const barberoActivoAqui = !esAdmin && esBarberoActivoDe(usuario, barberia._id.toString());
        const resenas = await getResenasByBarberiaId(barberia._id.toString());
        res.json(resenas.map(({ barberoId, ...resena }) => {
            const respuesta = resena.resena.respuesta;
            const puedeResponder = esAdmin
                || (barberoActivoAqui && barberoId?.toString() === userId && puedeGestionarRespuesta("barbero", respuesta, userId));
            return { ...sinAutorRespuesta(resena), puedeResponder };
        }));
    } catch (error) {
        registrarError("Error al obtener reseñas de la barbería:", error);
        responderErrorInterno(res, error, "Error al obtener reseñas");
    }
};

// DISPONIBILIDAD

// Días de un mes en los que un barbero tiene al menos un hueco para la duración indicada
export const getDiasDisponibles = async (req, res) => {
    try {
        const { barberoId, mes } = req.params;
        const { barberiaId } = req.query;

        if (!esObjectIdValido(barberiaId)) {
            return res.status(400).json({ error: "Se requiere el ID de la barbería" });
        }
        if (!RE_MES.test(mes)) {
            return res.status(400).json({ error: "Formato de mes no válido" });
        }
        const duracion = leerDuracion(req.query.duracion);
        if (duracion === null) {
            return res.status(400).json({ error: "Duración no válida" });
        }

        const hoy = momentoActual().fecha;
        const mesActual = hoy.slice(0, 7);
        if (mes < mesActual || mes > sumarMeses(mesActual, MAX_MESES_ADELANTE)) {
            return res.status(400).json({ error: "Mes fuera del rango de reservas" });
        }

        const [anio, numeroMes] = mes.split("-").map(Number);
        const ultimoDia = new Date(Date.UTC(anio, numeroMes, 0)).getUTCDate();
        // Lecturas independientes: se lanzan a la vez y se validan después, en el orden de siempre
        const [barberia, barbero, citasDelMes] = await Promise.all([
            getBarbershopById(barberiaId),
            getUserById(barberoId),
            getCitasByBarberoEnRango(barberoId, `${mes}-01`, `${mes}-${String(ultimoDia).padStart(2, "0")}`)
        ]);
        if (!barberia) {
            return res.status(404).json({ error: "Barbería no encontrada" });
        }
        // Un barbero desactivado no se ofrece para reservar: se responde igual que si no estuviera en la barbería
        if (!barbero || barbero.barberiaId?.toString() !== barberiaId || !barberoActivo(barbero)) {
            return res.status(404).json({ error: "Barbero no encontrado en esta barbería" });
        }

        const citasPorDia = new Map();
        for (const cita of citasDelMes) {
            citasPorDia.set(cita.fecha, [...(citasPorDia.get(cita.fecha) || []), cita]);
        }

        const dias = [];
        for (let dia = 1; dia <= ultimoDia; dia++) {
            const fecha = `${mes}-${String(dia).padStart(2, "0")}`;
            if (fecha < hoy) continue;
            const { horariosDisponibles } = calcularDisponibilidad(barberia, barbero, fecha, citasPorDia.get(fecha) || [], { duracion });
            if (horariosDisponibles.length > 0) dias.push(fecha);
        }

        res.json({ mes, barberoId, dias });
    } catch (error) {
        registrarError("Error al obtener días disponibles:", error);
        responderErrorInterno(res, error, "Error al obtener días disponibles");
    }
};

// Obtener horarios disponibles de un barbero en una fecha
export const getDisponibilidad = async (req, res) => {
    try {
        const { barberoId, fecha } = req.params;
        const { barberiaId } = req.query;
        const incluirEnCurso = req.query.incluirEnCurso === "true";
        // Duración total de los servicios elegidos; solo orienta la búsqueda, la reserva la recalcula desde la BD
        const duracion = leerDuracion(req.query.duracion);
        if (duracion === null) {
            return res.status(400).json({ error: "Duración no válida" });
        }

        if (!esObjectIdValido(barberiaId)) {
            return res.status(400).json({ error: "Se requiere el ID de la barbería" });
        }

        if (!RE_FECHA.test(fecha)) {
            return res.status(400).json({ error: "Formato de fecha no válido" });
        }

        // Las tres lecturas no dependen entre sí: se lanzan a la vez (una ida y vuelta a la BD en lugar de tres) y las
        // validaciones se hacen después, en el mismo orden de siempre. Con un 404 la lectura de citas sobra, pero es barata
        const [barberia, barbero, citasOcupadas] = await Promise.all([
            getBarbershopById(barberiaId),                  // horario base de la barbería
            getUserById(barberoId),                         // horario personal, excepciones y días libres
            getCitasByBarberoAndFecha(barberoId, fecha)     // citas del barbero ese día
        ]);
        if (!barberia) {
            return res.status(404).json({ error: "Barbería no encontrada" });
        }
        // Los barberos desactivados no se ofrecen
        if (!barbero || barbero.barberiaId?.toString() !== barberiaId || !barberoActivo(barbero)) {
            return res.status(404).json({ error: "Barbero no encontrado en esta barbería" });
        }

        const { estado, horariosDisponibles } = calcularDisponibilidad(barberia, barbero, fecha, citasOcupadas, { incluirEnCurso, duracion });

        res.json({
            fecha,
            barberoId,
            estado,
            horariosDisponibles
        });

    } catch (error) {
        registrarError("Error al obtener disponibilidad:", error);
        responderErrorInterno(res, error, "Error al obtener disponibilidad");
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

        // Solo booleanos reales: Boolean("false") sería true y marcaría la cita como cobrada
        if (typeof pagado !== "boolean") {
            return res.status(400).json({ error: "El campo pagado debe ser true o false" });
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
        const completar = pagado && cita.estado === "confirmada" && haEmpezado(cita);
        const revertir = !pagado && cita.estado === "completada" && cita.completadaPorPago === true && !cita.resena;
        const { matchedCount } = await updateCitaPago(id, pagado, nuevoImporte, { completar, revertir });
        if (matchedCount === 0) {
            return res.status(409).json({ error: MENSAJE_PAGO_NO_PERMITIDO });
        }
        const citaActualizada = await getCitaById(id);
        res.json({
            message: "Estado de pago actualizado correctamente",
            pagado,
            importePagado: nuevoImporte,
            cita: citaActualizada
        });

    } catch (error) {
        registrarError("Error al actualizar pago de cita:", error);
        responderErrorInterno(res, error, "Error al actualizar pago de cita");
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
        pendienteCobro: redondear(sumarPrecios(completadas.filter(c => !c.pagado))),
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
        const servicios = cita.servicios?.length
            ? cita.servicios
            : [{ _id: cita.servicioId, nombre: cita.servicioNombre, precio: precioDe(cita) }];
        for (const s of servicios) {
            const clave = s._id?.toString() || s.nombre;
            if (!porServicio.has(clave)) porServicio.set(clave, { nombre: s.nombre || "Servicio", citas: 0, ingresos: 0 });
            const servicio = porServicio.get(clave);
            servicio.citas++;
            servicio.ingresos += Number(s.precio) || 0;
        }
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
        registrarError("Error al obtener analíticas de barbería:", error);
        responderErrorInterno(res, error, "Error al obtener analíticas");
    }
};
