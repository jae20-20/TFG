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
    getMyHorario,
    getResenasPublicas,
    getServicios,
    registerBarberia,
    removeBarbero,
    updateMyHorario,
    validateCode
} from "../controllers/barbershopControllers.js";
import { isAdmin, verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// RUTAS PÚBLICAS
router.get("/", getBarberias);
router.get("/:id", getBarberia);
router.get("/:id/servicios", getServicios);
router.get("/:id/barberos", getBarberos);
router.get("/:id/resenas", getResenasPublicas);
router.post("/validate-code", validateCode);

// REGISTRO DE BARBERÍA
router.post("/register", registerBarberia);

//  RUTAS AUTENTICADAS (ADMIN O BARBERO)
router.get("/my/barberia", verifyToken, getMyBarberia);
router.put("/:id", verifyToken, isAdmin, editBarberia);
router.get("/my/horario", verifyToken, isAdmin, getMyHorario);
router.put("/my/horario", verifyToken, isAdmin, updateMyHorario);

// GESTIÓN DE SERVICIOS (ADMIN)
router.post("/:id/servicios", verifyToken, isAdmin, addServicio);
router.put("/:id/servicios/:servicioId", verifyToken, isAdmin, editServicio);
router.delete("/:id/servicios/:servicioId", verifyToken, isAdmin, deleteServicio);

//GESTIÓN DE BARBEROS (ADMIN)
router.delete("/:id/barberos/:barberoId", verifyToken, isAdmin, removeBarbero);

export default router;