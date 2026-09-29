// Protección contra inyección NoSQL: elimina claves que MongoDB interpretaría
// como operadores ($gt, $regex, $where...) o rutas anidadas ("a.b").
// Sustituye a express-mongo-sanitize, que no es compatible con Express 5
// (reasigna req.query, que en Express 5 es un getter de solo lectura).

const esClavePeligrosa = (clave) => clave.startsWith("$") || clave.includes(".");

const limpiar = (valor) => {
    if (Array.isArray(valor)) {
        valor.forEach(limpiar);
    } else if (valor && typeof valor === "object") {
        for (const clave of Object.keys(valor)) {
            if (esClavePeligrosa(clave)) {
                delete valor[clave];
            } else {
                limpiar(valor[clave]);
            }
        }
    }
    return valor;
};

export const mongoSanitize = (req, res, next) => {
    if (req.body) limpiar(req.body);

    // En Express 5 req.query se recalcula en cada acceso: se fija la copia saneada
    Object.defineProperty(req, "query", {
        value: limpiar(req.query),
        writable: true,
        configurable: true,
        enumerable: true
    });

    next();
};
