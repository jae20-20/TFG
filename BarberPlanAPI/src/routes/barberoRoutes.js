import express from "express";
import { validarObjectIdParam } from "../middleware/validateMiddleware.js";
import { verifyToken, isAdminOrBarbero, isBarbero } from "../middleware/authMiddleware.js";
import { desbloquearMiServicio, updateBarberoHorario } from "../controllers/userControllers.js";

const router = express.Router();
router.param("id", validarObjectIdParam);
router.param("servicioId", validarObjectIdParam);

// El barbero autenticado vuelve a ofrecer un servicio bloqueado (sin solicitud)
router.delete("/me/servicios-bloqueados/:servicioId", verifyToken, isBarbero, desbloquearMiServicio);

// Actualizar barbero (horarioEspecial, diasLibres, vacaciones)
router.put("/:id", verifyToken, isAdminOrBarbero, updateBarberoHorario);

export default router;
