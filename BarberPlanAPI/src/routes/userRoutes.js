//definicion endpoints - Usuarios
import express from "express";
import rateLimit from "express-rate-limit";

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
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Demasiados intentos, intenta más tarde"
});

//  RUTAS PÚBLICAS 
router.post("/login", authLimiter, loginUser);
router.post("/register",authLimiter, addUser);

// RUTAS PROTEGIDAS
router.get("/", verifyToken, getUsers)
router.get("/profile", verifyToken, getProfile);
router.put("/profile", verifyToken, editProfile);
router.post("/change-password", verifyToken, changePassword);

router.get("/:id", verifyToken, getUser);
router.delete("/:id", verifyToken, deleteUserAccount);

export default router;
