import express from "express";
import { verifyToken, isAdminOrBarbero } from "../middleware/authMiddleware.js";
import { updateBarberoHorario } from "../controllers/userControllers.js";

const router = express.Router();

// Actualizar barbero (horarioEspecial, diasLibres, vacaciones)
router.put("/:id", verifyToken, isAdminOrBarbero, updateBarberoHorario);

export default router;
