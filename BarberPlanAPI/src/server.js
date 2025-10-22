import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { connectDB } from "./db/connection.js";
import userRoutes from "./routes/userRoutes.js";
dotenv.config(); // Cargar variables de entorno

const PORT = process.env.PORT || 5050;
const app = express();

app.use(cors());
app.use(express.json());

//rutas
app.use("/user", userRoutes);
//app.use("/barbershop", barbershopRoutes);

// Conectar a la base de datos y luego iniciar el servidor
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`¡Éxito!, Servidor corriendo en http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error("GG, Error al iniciar el servidor:", err);
});
