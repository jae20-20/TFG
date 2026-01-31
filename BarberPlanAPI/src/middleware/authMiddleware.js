//middlewares para verificar el token JWT y roles

import jwt from "jsonwebtoken";

// ==================== VERIFICAR TOKEN ====================

export const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1]; // Obtener el token de la cabecera
  
    if (!token) {
      return res.status(401).json({ error: "Acceso denegado. Token no proporcionado" });
    }
  
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET); // Verificar el token
      req.user = decoded; // Guardar los datos del usuario en la solicitud
      next();
    } catch (error) {
      console.error("Error al verificar el token:", error);
      res.status(403).json({ error: "Token inválido o expirado" });
    }
};

// ==================== VERIFICAR ROLES ====================

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