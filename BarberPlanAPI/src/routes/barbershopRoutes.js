//definicion endpoints - Barberías
import express from "express";
import { validarObjectIdParam } from "../middleware/validateMiddleware.js";
import rateLimit from "express-rate-limit";
import {
    addServicio,
    createInvitacionEmpleado,
    deleteInvitacionEmpleado,
    deleteServicio,
    editBarberia,
    editServicio,
    getBarberia,
    getBarberias,
    getBarberos,
    getInvitacionesEmpleados,
    getMyBarberia,
    getMyHorario,
    getResenasPublicas,
    getServicios,
    registerBarberia,
    regenerarInvitacionEmpleado,
    removeBarbero,
    setEstadoBarbero,
    revocarInvitacionEmpleado,
    updateMyHorario,
    validateInvitationCode
} from "../controllers/barbershopControllers.js";
import { isAdmin, optionalAuth, verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();
router.param("id", validarObjectIdParam);
router.param("servicioId", validarObjectIdParam);
router.param("barberoId", validarObjectIdParam);
router.param("invitacionId", validarObjectIdParam);


// Limita los intentos de validar un código de invitación (evita fuerza bruta)
const invitationCodeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: { error: "Demasiados intentos, inténtalo más tarde" }
});

const registerLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "Demasiados intentos, intenta más tarde" }
});

// GESTIÓN DE INVITACIONES DE EMPLEADOS (ADMIN)
// Nota: se registran antes de "/:id" para que Express no interprete
// "invitaciones" como el parámetro :id de una barbería.
router.get("/invitaciones", verifyToken, isAdmin, getInvitacionesEmpleados);
router.post("/invitaciones", verifyToken, isAdmin, createInvitacionEmpleado);
router.post("/invitaciones/validar", invitationCodeLimiter, validateInvitationCode);
router.post("/invitaciones/:invitacionId/regenerar", verifyToken, isAdmin, regenerarInvitacionEmpleado);
router.put("/invitaciones/:invitacionId/revocar", verifyToken, isAdmin, revocarInvitacionEmpleado);
router.delete("/invitaciones/:invitacionId", verifyToken, isAdmin, deleteInvitacionEmpleado);

// REGISTRO DE BARBERÍA
router.post("/registro", registerLimiter, registerBarberia);

//  RUTAS AUTENTICADAS (ADMIN O BARBERO); antes de "/:id" por la misma razón
router.get("/mi/barberia", verifyToken, getMyBarberia);
router.get("/mi/horario", verifyToken, getMyHorario);
router.put("/mi/horario", verifyToken, isAdmin, updateMyHorario);

// RUTAS PÚBLICAS
router.get("/", getBarberias);
router.get("/:id", getBarberia);
router.get("/:id/servicios", getServicios);
router.get("/:id/barberos", optionalAuth, getBarberos);
router.get("/:id/resenas", getResenasPublicas);
router.put("/:id", verifyToken, isAdmin, editBarberia);

// GESTIÓN DE SERVICIOS (ADMIN)
router.post("/:id/servicios", verifyToken, isAdmin, addServicio);
router.put("/:id/servicios/:servicioId", verifyToken, isAdmin, editServicio);
router.delete("/:id/servicios/:servicioId", verifyToken, isAdmin, deleteServicio);

//GESTIÓN DE BARBEROS (ADMIN)
router.delete("/:id/barberos/:barberoId", verifyToken, isAdmin, removeBarbero);
router.put("/:id/barberos/:barberoId/estado", verifyToken, isAdmin, setEstadoBarbero);

export default router;
