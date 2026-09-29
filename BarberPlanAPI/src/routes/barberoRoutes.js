import express from "express";
import { validarObjectIdParam } from "../middleware/validateMiddleware.js";
import { verifyToken, isAdminOrBarbero } from "../middleware/authMiddleware.js";
import { updateBarberoHorario } from "../controllers/userControllers.js";

const router = express.Router();
router.param("id", validarObjectIdParam);


// Actualizar barbero (horarioEspecial, diasLibres, vacaciones)
router.put("/:id", verifyToken, isAdminOrBarbero, updateBarberoHorario);

export default router;
