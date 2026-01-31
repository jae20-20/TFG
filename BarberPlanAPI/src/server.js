import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { connectDB } from "./db/connection.js";

// Importar rutas
import barbershopRoutes from "./routes/barbershopRoutes.js";
import citaRoutes from "./routes/citaRoutes.js";
import userRoutes from "./routes/userRoutes.js";

dotenv.config(); // Cargar variables de entorno

const PORT = process.env.PORT || 5050;
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// ==================== RUTAS ====================
app.use("/user", userRoutes);           // Rutas de usuarios
app.use("/barberia", barbershopRoutes); // Rutas de barberías
app.use("/cita", citaRoutes);           // Rutas de citas

// Ruta de estado del servidor
app.get("/", (req, res) => {
  res.json({ 
    message: "BarberPlan API funcionando correctamente",
    version: "1.0.0",
    endpoints: {
      users: "/user",
      barberias: "/barberia",
      citas: "/cita"
    }
  });
});

// Conectar a la base de datos y luego iniciar el servidor
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`¡Éxito!, Servidor corriendo en http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error("GG, Error al iniciar el servidor:", err);
});
