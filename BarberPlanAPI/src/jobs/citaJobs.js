// Tareas periódicas sobre citas: caducar pendientes sin respuesta y cerrar asistencias sin registrar
import { cancelarPendientesVencidas, completarAsistenciasSinRegistrar } from "../models/citaModel.js";

const INTERVALO_MS = 5 * 60 * 1000;
const MARGEN_ASISTENCIA_MS = 48 * 60 * 60 * 1000;

const momentoMadrid = (fecha) => ({
    fecha: fecha.toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" }),
    hora: fecha.toLocaleTimeString("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hour12: false })
});

export const procesarCitasVencidas = async (ahora = new Date()) => {
    const actual = momentoMadrid(ahora);
    const limite = momentoMadrid(new Date(ahora.getTime() - MARGEN_ASISTENCIA_MS));
    const [expiradas, completadas] = await Promise.all([
        cancelarPendientesVencidas(ahora, actual.fecha, actual.hora),
        completarAsistenciasSinRegistrar(limite.fecha, limite.hora)
    ]);
    return { expiradas: expiradas.modifiedCount, completadas: completadas.modifiedCount };
};

export const iniciarTareasCitas = () => {
    const ejecutar = () => procesarCitasVencidas().catch((error) => {
        console.error("Error en la tarea periódica de citas:", error);
    });
    ejecutar();
    return setInterval(ejecutar, INTERVALO_MS);
};
