import dotenv from "dotenv";
import { MongoClient, ServerApiVersion } from "mongodb";
dotenv.config(); 

const uri = process.env.ATLAS_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// DB_NAME permite apuntar los tests de integración a una base de datos desechable
const db = client.db(process.env.DB_NAME || "BarberPlan");

async function connectDB() {
  try {
    await client.connect();
    console.log("Conectado a MongoDB Atlas");
  } catch (error) {
    console.error("Error al conectar a MongoDB", error);
  }}
export { client, connectDB, db };
