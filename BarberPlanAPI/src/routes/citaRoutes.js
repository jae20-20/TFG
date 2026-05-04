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
router.get("/disponibilidad/:barberoId/:fecha", getDisponibilidad);  

// ==================== RUTAS DE CLIENTE ====================
router.post("/", verifyToken, isCliente, crearCita);
router.get("/mis-citas", verifyToken, isCliente, getMisCitas);

// ==================== RUTAS DE BARBERO ====================
router.get("/barbero", verifyToken, isBarbero, getCitasBarbero);

// ==================== RUTAS DE ADMIN ====================
router.get("/barberia/:barberiaId", verifyToken, isAdmin, getCitasBarberia);

// ==================== RUTAS COMPARTIDAS ====================
router.get("/:id", verifyToken, getCita);
router.put("/:id/confirmar", verifyToken, isAdminOrBarbero, confirmarCita);
router.put("/:id/completar", verifyToken, isAdminOrBarbero, completarCita);
router.put("/:id/cancelar", verifyToken, cancelarCita);

export default router;
