//definicion endpoints - Citas
import express from "express";
import { validarObjectIdParam } from "../middleware/validateMiddleware.js";
import {
    cancelarCita,
    completarCita,
    confirmarCita,
    crearCita,
    crearCitaManual,
    crearResena,
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
    rechazarCita
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
router.param("id", validarObjectIdParam);
router.param("barberoId", validarObjectIdParam);
router.param("barberiaId", validarObjectIdParam);


// ==================== RUTAS PÚBLICAS ====================
router.get("/disponibilidad/:barberoId/mes/:mes", getDiasDisponibles);
router.get("/disponibilidad/:barberoId/:fecha", getDisponibilidad);

// ==================== RUTAS DE CREACIÓN ====================
router.post("/manual", authEscritura, isAdminOrBarbero, crearCitaManual);
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

export default router;
