// Se importa el primero en server.js: ES modules evalúa los imports en orden, así que la configuración
// se comprueba antes de que db/connection.js cree el cliente de Mongo con una cadena que puede faltar.
import { validarEntorno } from "./config.js";

try {
    validarEntorno();
} catch (error) {
    console.error(`GG, ${error.message}`);
    process.exit(1);
}
