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

// RUTAS PÚBLICAS
router.get("/", getBarberias);
router.get("/:id", getBarberia);
router.get("/:id/servicios", getServicios);
router.get("/:id/barberos", getBarberos);
router.post("/validate-code", validateCode);

// REGISTRO DE BARBERÍA
router.post("/register", registerBarberia);

//  RUTAS DE ADMIN
router.get("/my/barberia", verifyToken, isAdmin, getMyBarberia);
router.put("/:id", verifyToken, isAdmin, editBarberia);

// GESTIÓN DE SERVICIOS (ADMIN)
router.post("/:id/servicios", verifyToken, isAdmin, addServicio);
router.put("/:id/servicios/:servicioId", verifyToken, isAdmin, editServicio);
router.delete("/:id/servicios/:servicioId", verifyToken, isAdmin, deleteServicio);

//GESTIÓN DE BARBEROS (ADMIN)
router.delete("/:id/barberos/:barberoId", verifyToken, isAdmin, removeBarbero);

export default router;