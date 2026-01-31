//definicion endpoints - Barberías
import express from "express";
import {
    addServicio,
    deleteServicio,
    editBarberia,
    editServicio,
    getBarberia,
    getBarberias,
    getBarberos,
    getMyBarberia,
    getServicios,
    registerBarberia,
    removeBarbero,
    validateCode
} from "../controllers/barbershopControllers.js";
import { isAdmin, verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// ==================== RUTAS PÚBLICAS ====================
router.get("/", getBarberias);                      // GET /barberia - Obtener todas las barberías
router.get("/:id", getBarberia);                    // GET /barberia/:id - Obtener barbería por ID
router.get("/:id/servicios", getServicios);         // GET /barberia/:id/servicios - Obtener servicios de una barbería
router.get("/:id/barberos", getBarberos);           // GET /barberia/:id/barberos - Obtener barberos de una barbería
router.post("/validate-code", validateCode);         // POST /barberia/validate-code - Validar código de barbería

// ==================== REGISTRO DE BARBERÍA ====================
router.post("/register", registerBarberia);          // POST /barberia/register - Registrar barbería + admin

// ==================== RUTAS DE ADMIN ====================
router.get("/my/barberia", verifyToken, isAdmin, getMyBarberia);  // GET /barberia/my/barberia - Obtener mi barbería (admin)
router.put("/:id", verifyToken, isAdmin, editBarberia);           // PUT /barberia/:id - Editar barbería

// ==================== GESTIÓN DE SERVICIOS (ADMIN) ====================
router.post("/:id/servicios", verifyToken, isAdmin, addServicio);                  // POST /barberia/:id/servicios - Añadir servicio
router.put("/:id/servicios/:servicioId", verifyToken, isAdmin, editServicio);      // PUT /barberia/:id/servicios/:servicioId - Editar servicio
router.delete("/:id/servicios/:servicioId", verifyToken, isAdmin, deleteServicio); // DELETE /barberia/:id/servicios/:servicioId - Eliminar servicio

// ==================== GESTIÓN DE BARBEROS (ADMIN) ====================
router.delete("/:id/barberos/:barberoId", verifyToken, isAdmin, removeBarbero);    // DELETE /barberia/:id/barberos/:barberoId - Eliminar barbero

export default router;