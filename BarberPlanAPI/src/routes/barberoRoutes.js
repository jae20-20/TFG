import express from "express";
import { validarObjectIdParam } from "../middleware/validateMiddleware.js";
import { authEscritura, isAdminOrBarbero, isBarbero } from "../middleware/authMiddleware.js";
import { desbloquearMiServicio, updateBarberoHorario } from "../controllers/userControllers.js";

const router = express.Router();
router.param("id", validarObjectIdParam);
router.param("servicioId", validarObjectIdParam);

// El barbero autenticado vuelve a ofrecer un servicio bloqueado (sin solicitud)
router.delete("/mi/servicios-bloqueados/:servicioId", authEscritura, isBarbero, desbloquearMiServicio);

// Actualizar barbero (horarioEspecial, diasLibres, vacaciones)
router.put("/:id", authEscritura, isAdminOrBarbero, updateBarberoHorario);

export default router;
