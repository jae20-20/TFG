// Tareas periódicas sobre citas: caducar pendientes sin respuesta y cerrar asistencias sin registrar
import { registrarError } from "../utils/registrarError.js";
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

// Arranca las tareas y espera a que termine la primera pasada. Con un hosting que duerme la instancia (Render gratuito, a
// los 15 minutos sin tráfico) el proceso nace de nuevo al despertar: esa primera pasada pone al día todo lo que venció
// mientras dormía, y como se espera antes de abrir el puerto, la primera petición ya ve las citas al día.
export const iniciarTareasCitas = async () => {
    let enCurso = false;
    const ejecutar = async () => {
        // Si la anterior sigue (Atlas lento) no se solapa otra
        if (enCurso) return;
        enCurso = true;
        try {
            await procesarCitasVencidas();
        } catch (error) {
            registrarError("Error en la tarea periódica de citas", error);
        } finally {
            enCurso = false;
        }
    };
    await ejecutar();
    return setInterval(ejecutar, INTERVALO_MS);
};
