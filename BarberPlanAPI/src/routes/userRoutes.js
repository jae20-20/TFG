//definicion endpoints - Usuarios
import express from "express";
import {
    addUser,
    changePassword,
    deleteUserAccount,
    editProfile,
    getProfile,
    getUser,
    getUsers,
    loginUser
} from "../controllers/userControllers.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// ==================== RUTAS PÚBLICAS ====================
router.post("/login", loginUser);           // POST /user/login - Iniciar sesión
router.post("/register", addUser);          // POST /user/register - Registrar usuario (cliente o barbero)

// ==================== RUTAS PROTEGIDAS ====================
router.get("/", verifyToken, getUsers);                     // GET /user - Obtener todos los usuarios (admin)
router.get("/profile", verifyToken, getProfile);            // GET /user/profile - Obtener mi perfil
router.put("/profile", verifyToken, editProfile);           // PUT /user/profile - Actualizar mi perfil
router.post("/change-password", verifyToken, changePassword); // POST /user/change-password - Cambiar contraseña

router.get("/:id", verifyToken, getUser);                   // GET /user/:id - Obtener usuario por ID
router.delete("/:id", verifyToken, deleteUserAccount);      // DELETE /user/:id - Eliminar usuario

export default router;
