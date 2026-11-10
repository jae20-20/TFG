//definicion endpoints - Usuarios
import express from "express";
import { validarObjectIdParam } from "../middleware/validateMiddleware.js";
import rateLimit from "express-rate-limit";

import {
    addUser,
    changePassword,
    deleteMyAccount,
    deleteUserAccount,
    editProfile,
    getProfile,
    getResumenEliminacion,
    getUser,
    getUsers,
    loginUser
} from "../controllers/userControllers.js";
import { authEscritura, isAdmin, verifyToken } from "../middleware/authMiddleware.js";
import { config } from "../config.js";

const router = express.Router();
router.param("id", validarObjectIdParam);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.limiteAutenticacion,
  message: { error: "Demasiados intentos, intenta más tarde" }
});

// Fallos de contraseña actual al cambiarla: por usuario (va detrás de verifyToken), no por IP, y solo
// cuentan las respuestas 401. Los errores de formato de la nueva (400) y los cambios correctos se descuentan
const cambioPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.user.id,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (req, res) => res.statusCode !== 401,
  message: { error: "Demasiados intentos, inténtalo más tarde" }
});

// Eliminar la propia cuenta pide la contraseña: mismo criterio que el cambio de contraseña (fallos 401 por usuario)
const eliminarCuentaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.user.id,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (req, res) => res.statusCode !== 401,
  message: { error: "Demasiados intentos, inténtalo más tarde" }
});

//  RUTAS PÚBLICAS
router.post("/login", authLimiter, loginUser);
router.post("/registro", authLimiter, addUser);

// RUTAS PROTEGIDAS (las fijas antes de "/:id"). Las que escriben usan authEscritura: token + cuenta vigente
router.get("/", verifyToken, isAdmin, getUsers);
router.get("/perfil", verifyToken, getProfile);
router.put("/perfil", authEscritura, editProfile);
router.post("/cambiar-contrasena", authEscritura, cambioPasswordLimiter, changePassword);
router.get("/perfil/eliminacion", verifyToken, getResumenEliminacion);
router.delete("/perfil", authEscritura, eliminarCuentaLimiter, deleteMyAccount);

router.get("/:id", verifyToken, getUser);
router.delete("/:id", authEscritura, deleteUserAccount);

export default router;
