import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import mongoSanitize from "express-mongo-sanitize";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

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
app.use(helmet());

//linite solictudes por IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100
});

app.use(globalLimiter);

// Sanitizar entradas
app.use(mongoSanitize());

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
