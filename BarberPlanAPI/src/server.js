import { registrarError } from "./utils/registrarError.js";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import "./comprobarEntorno.js";
import { config } from "./config.js";
import { connectDB } from "./db/connection.js";
import { crearIndices } from "./db/indices.js";
import { iniciarTareasCitas } from "./jobs/citaJobs.js";
import { manejadorErrores, rutaNoEncontrada } from "./middleware/errorMiddleware.js";
import { mongoSanitize } from "./middleware/sanitizeMiddleware.js";

// Importar rutas
import barbershopRoutes from "./routes/barbershopRoutes.js";
import citaRoutes from "./routes/citaRoutes.js";
import solicitudRoutes from "./routes/solicitudRoutes.js";
import barberoRoutes from "./routes/barberoRoutes.js";
import userRoutes from "./routes/userRoutes.js";

const app = express();

// Detrás de un proxy (hosting) la IP real del cliente viene en X-Forwarded-For; sin esto todos
// compartirían la IP del proxy y el límite de peticiones. Se activa con TRUST_PROXY
if (config.trustProxy) {
  app.set("trust proxy", config.trustProxy);
}

// Middleware
app.use(helmet());
app.use(cors({ origin: config.origenesCors }));
// 4 MB: lo más grande que se envía es la galería de la barbería (hasta 6 imágenes de ~160 KB, ver validateMiddleware.js)
app.use(express.json({ limit: "4mb" }));
app.use(express.urlencoded({ limit: "4mb", extended: true }));
app.use(mongoSanitize);

//linite solictudes por IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: config.limiteGlobal,
  message: { error: "Demasiadas peticiones, inténtalo más tarde" }
});

app.use(globalLimiter);

// ==================== RUTAS ====================
app.use("/usuarios", userRoutes);         // Rutas de usuarios
app.use("/barberias", barbershopRoutes);  // Rutas de barberías
app.use("/citas", citaRoutes);            // Rutas de citas
app.use("/solicitudes", solicitudRoutes); // Rutas de solicitudes
app.use("/barberos", barberoRoutes);      // Rutas de barberos

// Ruta de estado del servidor
app.get("/", (req, res) => {
  res.json({
    message: "BarberPlan API funcionando correctamente",
    version: "1.0.0",
    endpoints: {
      usuarios: "/usuarios",
      barberias: "/barberias",
      citas: "/citas",
      solicitudes: "/solicitudes",
      barberos: "/barberos"
    }
  });
});

// Después de todas las rutas: 404 y errores no controlados, también en formato { error }
app.use(rutaNoEncontrada);
app.use(manejadorErrores);

// Conectar a la base de datos, asegurar los índices y luego iniciar el servidor
connectDB().then(crearIndices).then(async () => {
  // Primero se ponen al día las citas vencidas y después se abre el puerto (ver citaJobs.js)
  if (config.tareasCitas) {
    await iniciarTareasCitas();
  }
  app.listen(config.puerto, () => {
    console.log(`¡Éxito!, Servidor corriendo en el puerto ${config.puerto} (${config.entorno})`);
  });
}).catch(err => {
  registrarError("GG, Error al iniciar el servidor:", err);
  process.exit(1);
});
