import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import { connectDB } from "./db/connection.js";
import { iniciarTareasCitas } from "./jobs/citaJobs.js";
import { mongoSanitize } from "./middleware/sanitizeMiddleware.js";

// Importar rutas
import barbershopRoutes from "./routes/barbershopRoutes.js";
import citaRoutes from "./routes/citaRoutes.js";
import solicitudRoutes from "./routes/solicitudRoutes.js";
import barberoRoutes from "./routes/barberoRoutes.js";
import userRoutes from "./routes/userRoutes.js";

dotenv.config(); // Cargar variables de entorno

const PORT = process.env.PORT || 5050;
const app = express();

// Orígenes permitidos: navegador en desarrollo (ng serve / ionic serve) y
// WebViews de Capacitor (Android: http://localhost, iOS: capacitor://localhost).
// En producción se definen en .env con CORS_ORIGINS separados por comas.
const DEFAULT_CORS_ORIGINS = [
  "http://localhost:4200",
  "http://localhost:8100",
  "http://localhost",
  "capacitor://localhost",
  "ionic://localhost"
];
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
  : DEFAULT_CORS_ORIGINS;

// Middleware
app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));
app.use(mongoSanitize);

//linite solictudes por IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  // RATE_LIMIT_MAX solo se sube en las pruebas de integración, que lanzan cientos de peticiones desde una IP
  max: Number(process.env.RATE_LIMIT_MAX) || 100
});

app.use(globalLimiter);

// ==================== RUTAS ====================
app.use("/user", userRoutes);           // Rutas de usuarios
app.use("/barberia", barbershopRoutes); // Rutas de barberías
app.use("/cita", citaRoutes);           // Rutas de citas
app.use("/solicitud", solicitudRoutes); // Rutas de solicitudes
app.use("/barbero", barberoRoutes);     // Rutas de barberos

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
  // TAREAS_CITAS=off arranca sin tareas periódicas (pruebas que no deben escribir en la BD)
  if (process.env.TAREAS_CITAS !== "off") {
    iniciarTareasCitas();
  }
}).catch(err => {
  console.error("GG, Error al iniciar el servidor:", err);
});
