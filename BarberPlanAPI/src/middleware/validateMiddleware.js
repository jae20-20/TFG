// Validaciones de entrada compartidas por rutas y controladores

export const esObjectIdValido = (valor) => typeof valor === "string" && /^[a-f\d]{24}$/i.test(valor);

// Para router.param: rechaza IDs mal formados antes de que new ObjectId() lance un 500
export const validarObjectIdParam = (req, res, next, valor) => {
    if (!esObjectIdValido(valor)) {
        return res.status(400).json({ error: "Identificador no válido" });
    }
    next();
};

export const PW_MIN_LENGTH = 8;
export const MENSAJE_PW_CORTA = `La contraseña debe tener al menos ${PW_MIN_LENGTH} caracteres`;

// Respuesta 409 de cada campo con índice único en Usuarios; la comprobación previa y el error 11000 dan el mismo mensaje
export const MENSAJES_DUPLICADO = {
    correo: "El correo ya está registrado",
    usuario: "El nombre de usuario ya está en uso"
};
