//middlewares para seguridad y control de acceso

import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { getSesionUsuario } from "../models/userModel.js";
import { esObjectIdValido } from "./validateMiddleware.js";

// ======== VERIFICAR TOKEN

export const verifyToken = (req, res, next) => {
        const token = req.headers.authorization?.split(" ")[1]; // Obtener el token de la cabecera
        if (!token) {
                return res.status(401).json({ error: "Acceso denegado. Token no proporcionado" });
        }
        try {
                const decoded = jwt.verify(token, config.jwtSecret); // Verificar el token
                req.user = decoded; // Guardar los datos del usuario en la solicitud
                next();
        } catch (error) {
                // No filtrar si es expirado o inválido para evitar filtrado de información
                res.status(401).json({ error: "Token inválido o expirado" });
        }
};

// Para rutas públicas que devuelven más datos a usuarios autorizados: si hay
// un token válido rellena req.user; si no lo hay (o es inválido) sigue como anónimo.
export const optionalAuth = (req, res, next) => {
        const token = req.headers.authorization?.split(" ")[1];
        if (token) {
                try {
                        req.user = jwt.verify(token, config.jwtSecret);
                } catch {
                        req.user = undefined;
                }
        }
        next();
};

// Para las rutas que escriben: el JWT es válido 24 h, pero la cuenta puede haberse eliminado o haber cambiado
// de contraseña desde que se emitió. Una sola lectura (solo _id y fecha del último cambio de contraseña)
// comprueba las dos cosas; las lecturas no la hacen, para no añadir una consulta a cada GET.
export const verificarCuenta = async (req, res, next) => {
        if (!esObjectIdValido(req.user?.id)) {
                return res.status(401).json({ error: "Token inválido o expirado" });
        }
        const sesion = await getSesionUsuario(req.user.id);
        if (!sesion) {
                return res.status(401).json({ error: "La cuenta ya no existe" });
        }
        // iat va en segundos; una sesión anterior al último cambio de contraseña deja de valer
        if (sesion.passwordChangedAt && Math.floor(sesion.passwordChangedAt.getTime() / 1000) > req.user.iat) {
                return res.status(401).json({ error: "La contraseña ha cambiado. Inicia sesión de nuevo" });
        }
        next();
};

// Autenticación de las rutas de escritura de cualquier rol: token válido + cuenta vigente
export const authEscritura = [verifyToken, verificarCuenta];

// ======= VERIFICAR ROLES

// Middleware para verificar que el usuario tiene uno de los roles permitidos
export const checkRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: "No autenticado" });
        }

        if (!allowedRoles.includes(req.user.rol)) {
            return res.status(403).json({ 
                error: "No tienes permiso para acceder a este recurso",
                requiredRoles: allowedRoles,
                yourRole: req.user.rol
            });
        }

        next();
    };
};

// Middleware específico para admin
export const isAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: "No autenticado" });
    }

    if (req.user.rol !== "admin") {
        return res.status(403).json({ error: "Se requiere rol de administrador" });
    }

    next();
};

// Middleware específico para barbero
export const isBarbero = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: "No autenticado" });
    }

    if (req.user.rol !== "barbero") {
        return res.status(403).json({ error: "Se requiere rol de barbero" });
    }

    next();
};

// Middleware específico para cliente
export const isCliente = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: "No autenticado" });
    }

    if (req.user.rol !== "cliente") {
        return res.status(403).json({ error: "Se requiere rol de cliente" });
    }

    next();
};

// Middleware para admin o barbero (gestión de citas)
export const isAdminOrBarbero = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: "No autenticado" });
    }

    if (req.user.rol !== "admin" && req.user.rol !== "barbero") {
        return res.status(403).json({ error: "Se requiere rol de administrador o barbero" });
    }

    next();
};

// Middleware para verificar que el usuario pertenece a una barbería
export const hasBarberia = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: "No autenticado" });
    }

    if (!req.user.barberiaId) {
        return res.status(403).json({ error: "No estás asociado a ninguna barbería" });
    }

    next();
};