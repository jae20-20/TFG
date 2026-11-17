//definicion endpoints - Citas
import express from "express";
import rateLimit from "express-rate-limit";
import { config } from "../config.js";
import { correoClienteIndicado, validarObjectIdParam } from "../middleware/validateMiddleware.js";
import {
    cancelarCita,
    completarCita,
    confirmarCita,
    crearCita,
    crearCitaManual,
    crearResena,
    editarRespuesta,
    eliminarRespuesta,
    getAnaliticasBarberia,
    getCita,
    getCitasBarberia,
    getCitasBarbero,
    getDiasDisponibles,
    getDisponibilidad,
    getMisCitas,
    getResenasBarberia,
    actualizarPagoCita,
    marcarAvisosLeidos,
    marcarNoPresentada,
    rechazarCita,
    responderResena
} from "../controllers/citaControllers.js";
import {
    authEscritura,
    isAdmin,
    isAdminOrBarbero,
    isBarbero,
    isCliente,
    verifyToken
} from "../middleware/authMiddleware.js";

const router = express.Router();

// Asignar una cita manual por correo revela si existe un cliente con ese correo: se limita por usuario (va detrás de
// authEscritura) y solo cuentan las peticiones que traen correo; las citas manuales con solo el nombre no gastan cupo
const busquedaClienteLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: config.limiteBusquedaCliente,
    keyGenerator: (req) => req.user.id,
    skip: (req) => !correoClienteIndicado(req.body),
    message: { error: "Demasiadas búsquedas de clientes por correo, inténtalo más tarde" }
});
router.param("id", validarObjectIdParam);
router.param("barberoId", validarObjectIdParam);
router.param("barberiaId", validarObjectIdParam);


// ==================== RUTAS PÚBLICAS ====================
router.get("/disponibilidad/:barberoId/mes/:mes", getDiasDisponibles);
router.get("/disponibilidad/:barberoId/:fecha", getDisponibilidad);

// ==================== RUTAS DE CREACIÓN ====================
router.post("/manual", authEscritura, isAdminOrBarbero, busquedaClienteLimiter, crearCitaManual);
router.post("/", authEscritura, isCliente, crearCita);
router.get("/mis-citas", verifyToken, isCliente, getMisCitas);
// El cliente da por vistos sus avisos (RF12): solo toca las citas del propio cliente autenticado
router.put("/avisos/leidos", authEscritura, isCliente, marcarAvisosLeidos);

// ==================== RUTAS DE BARBERO ====================
router.get("/barbero", verifyToken, isBarbero, getCitasBarbero);

// ==================== RUTAS DE ADMIN ====================
router.get("/barberia/:barberiaId", verifyToken, isAdmin, getCitasBarberia);
router.get("/barberia/:barberiaId/analiticas", verifyToken, isAdmin, getAnaliticasBarberia);

// ==================== RUTAS DE RESEÑAS ====================
router.get("/resenas/barberia", verifyToken, isAdminOrBarbero, getResenasBarberia);

// ==================== RUTAS COMPARTIDAS ====================
router.get("/:id", verifyToken, getCita);
router.put("/:id/confirmar", authEscritura, isAdminOrBarbero, confirmarCita);
router.put("/:id/rechazar", authEscritura, isAdminOrBarbero, rechazarCita);
router.put("/:id/completar", authEscritura, isAdminOrBarbero, completarCita);
router.put("/:id/no-presentada", authEscritura, isAdminOrBarbero, marcarNoPresentada);
router.put("/:id/pago", authEscritura, isAdminOrBarbero, actualizarPagoCita);
router.put("/:id/cancelar", authEscritura, cancelarCita);
router.post("/:id/resena", authEscritura, isCliente, crearResena);
// Respuesta a la reseña de la cita :id. El rol solo filtra; el permiso real (dueño de la barbería o barbero que
// atendió la cita) se comprueba en la BD dentro del controlador
router.post("/:id/resena/respuesta", authEscritura, isAdminOrBarbero, responderResena);
router.put("/:id/resena/respuesta", authEscritura, isAdminOrBarbero, editarRespuesta);
router.delete("/:id/resena/respuesta", authEscritura, isAdminOrBarbero, eliminarRespuesta);

export default router;
