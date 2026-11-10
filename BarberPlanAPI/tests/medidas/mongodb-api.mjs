// El driver de MongoDB de la API (BarberPlanAPI/node_modules), no el que trae mongodb-memory-server en
// tests/medidas/node_modules: los ObjectId y demás tipos BSON de ambos no se pueden mezclar. Los datos de la prueba los
// crea semilla.mjs con el driver de la API, y el servidor que se mide también lo usa.
import { createRequire } from "node:module";
import path from "node:path";
import { RAIZ_API } from "../entorno.mjs";

const requerir = createRequire(path.join(RAIZ_API, "package.json"));
export const { MongoClient, ObjectId } = requerir("mongodb");
