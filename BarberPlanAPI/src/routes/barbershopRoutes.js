//definicion endpoints - Barberías
import express from "express";
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
    revocarInvitacionEmpleado,
    updateMyHorario,
    validateInvitationCode
} from "../controllers/barbershopControllers.js";
import { isAdmin, verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Limita los intentos de validar un código de invitación (evita fuerza bruta)
const invitationCodeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: "Demasiados intentos, inténtalo más tarde"
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
router.post("/register", registerBarberia);

//  RUTAS AUTENTICADAS (ADMIN O BARBERO)
router.get("/my/barberia", verifyToken, getMyBarberia);
router.get("/my/horario", verifyToken, getMyHorario);
router.put("/my/horario", verifyToken, isAdmin, updateMyHorario);

// RUTAS PÚBLICAS
router.get("/", getBarberias);
router.get("/:id", getBarberia);
router.get("/:id/servicios", getServicios);
router.get("/:id/barberos", getBarberos);
router.get("/:id/resenas", getResenasPublicas);
router.put("/:id", verifyToken, isAdmin, editBarberia);

// GESTIÓN DE SERVICIOS (ADMIN)
router.post("/:id/servicios", verifyToken, isAdmin, addServicio);
router.put("/:id/servicios/:servicioId", verifyToken, isAdmin, editServicio);
router.delete("/:id/servicios/:servicioId", verifyToken, isAdmin, deleteServicio);

//GESTIÓN DE BARBEROS (ADMIN)
router.delete("/:id/barberos/:barberoId", verifyToken, isAdmin, removeBarbero);

export default router;
