import { registrarError } from "../utils/registrarError.js";
import { MongoClient, ServerApiVersion } from "mongodb";
import { config } from "../config.js";

const client = new MongoClient(config.atlasUri, {
  serverSelectionTimeoutMS: config.mongoSeleccionMs,
  socketTimeoutMS: config.mongoSocketMs,
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// DB_NAME permite apuntar los tests de integración a una base de datos desechable
const db = client.db(config.nombreBD);

// Si no hay conexión el error se propaga: el servidor no debe arrancar sin base de datos
async function connectDB() {
  try {
    await client.connect();
    console.log("Conectado a MongoDB Atlas");
  } catch (error) {
    registrarError("Error al conectar a MongoDB", error);
    throw error;
  }
}
export { client, connectDB, db };
