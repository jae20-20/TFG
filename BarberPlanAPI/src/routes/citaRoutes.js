//definicion endpoints - Citas
import express from "express";
import {
    cancelarCita,
    completarCita,
    confirmarCita,
    crearCita,
    getCita,
    getCitasBarberia,
    getCitasBarbero,
    getDisponibilidad,
    getMisCitas
} from "../controllers/citaControllers.js";
import {
    isAdmin,
    isAdminOrBarbero,
    isBarbero,
    isCliente,
    verifyToken
} from "../middleware/authMiddleware.js";

const router = express.Router();

// ==================== RUTAS PÚBLICAS ====================
router.get("/disponibilidad/:barberoId/:fecha", getDisponibilidad);  // GET /cita/disponibilidad/:barberoId/:fecha - Obtener disponibilidad

// ==================== RUTAS DE CLIENTE ====================
router.post("/", verifyToken, isCliente, crearCita);                 // POST /cita - Crear nueva cita
router.get("/mis-citas", verifyToken, isCliente, getMisCitas);       // GET /cita/mis-citas - Obtener mis citas (cliente)

// ==================== RUTAS DE BARBERO ====================
router.get("/barbero", verifyToken, isBarbero, getCitasBarbero);     // GET /cita/barbero - Obtener citas del barbero

// ==================== RUTAS DE ADMIN ====================
router.get("/barberia/:barberiaId", verifyToken, isAdmin, getCitasBarberia);  // GET /cita/barberia/:barberiaId - Obtener citas de la barbería

// ==================== RUTAS COMPARTIDAS ====================
router.get("/:id", verifyToken, getCita);                            // GET /cita/:id - Obtener cita por ID
router.put("/:id/confirmar", verifyToken, isAdminOrBarbero, confirmarCita);   // PUT /cita/:id/confirmar - Confirmar cita
router.put("/:id/completar", verifyToken, isAdminOrBarbero, completarCita);   // PUT /cita/:id/completar - Marcar cita como completada
router.put("/:id/cancelar", verifyToken, cancelarCita);              // PUT /cita/:id/cancelar - Cancelar cita

export default router;
