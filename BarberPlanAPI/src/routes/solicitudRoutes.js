import express from "express";
import { 
    createBarberSolicitud, 
    getMisSolicitudes, 
    getSolicitudesEquipo, 
    responderSolicitud, 
    eliminarSolicitud 
} from "../controllers/solicitudControllers.js";
import { verifyToken, isBarbero, isAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

// Rutas para Barbero
router.post("/", verifyToken, isBarbero, createBarberSolicitud);
router.get("/mis-solicitudes", verifyToken, isBarbero, getMisSolicitudes);
router.delete("/:id", verifyToken, isBarbero, eliminarSolicitud);

// Rutas para Admin
router.get("/equipo", verifyToken, isAdmin, getSolicitudesEquipo);
router.put("/:id/responder", verifyToken, isAdmin, responderSolicitud);

export default router;
