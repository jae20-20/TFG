// Respuestas de error comunes a toda la API, siempre con el formato { error }

// Ninguna ruta coincide con la petición
export const rutaNoEncontrada = (req, res) => {
    res.status(404).json({ error: "Ruta no encontrada" });
};

// Errores que no ha respondido ningún controlador: cuerpo mal formado o demasiado grande
// (los lanza express.json antes de llegar a las rutas) y excepciones no capturadas.
// Express lo reconoce como manejador de errores por tener cuatro parámetros (next incluido)
export const manejadorErrores = (err, req, res, next) => {
    if (err.type === "entity.parse.failed") {
        return res.status(400).json({ error: "El cuerpo de la petición no es un JSON válido" });
    }
    if (err.type === "entity.too.large") {
        return res.status(413).json({ error: "La petición es demasiado grande" });
    }
    // Otros errores de lectura del cuerpo (codificación o juego de caracteres no admitidos)
    if (err.status >= 400 && err.status < 500) {
        return res.status(err.status).json({ error: "Petición no válida" });
    }
    console.error("Error no controlado:", err);
    res.status(500).json({ error: "Error interno del servidor" });
};
