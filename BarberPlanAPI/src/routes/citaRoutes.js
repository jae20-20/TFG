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
    getCita,
    getCitasBarberia,
    getCitasBarbero,
    getDisponibilidad,
    getMisCitas,
    getResenasBarberia,
    actualizarPagoCita
} from "../controllers/citaControllers.js";
import {
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
router.get("/disponibilidad/:barberoId/:fecha", getDisponibilidad);  

// ==================== RUTAS DE CREACIÓN ====================
router.post("/manual", verifyToken, isAdminOrBarbero, crearCitaManual);
router.post("/", verifyToken, isCliente, crearCita);
router.get("/mis-citas", verifyToken, isCliente, getMisCitas);

// ==================== RUTAS DE BARBERO ====================
router.get("/barbero", verifyToken, isBarbero, getCitasBarbero);

// ==================== RUTAS DE ADMIN ====================
router.get("/barberia/:barberiaId", verifyToken, isAdmin, getCitasBarberia);

// ==================== RUTAS DE RESEÑAS ====================
router.get("/resenas/barberia", verifyToken, isAdminOrBarbero, getResenasBarberia);

// ==================== RUTAS COMPARTIDAS ====================
router.get("/:id", verifyToken, getCita);
router.put("/:id/confirmar", verifyToken, isAdminOrBarbero, confirmarCita);
router.put("/:id/completar", verifyToken, isAdminOrBarbero, completarCita);
router.put("/:id/pago", verifyToken, isAdminOrBarbero, actualizarPagoCita);
router.put("/:id/cancelar", verifyToken, cancelarCita);
router.post("/:id/resena", verifyToken, isCliente, crearResena);

export default router;
