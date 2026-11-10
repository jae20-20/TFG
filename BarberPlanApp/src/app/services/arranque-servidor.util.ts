// La API gratuita de Render se duerme tras 15 minutos sin tráfico y tarda hasta ~1 minuto en despertar. Estas funciones
// permiten avisar al usuario de que el servidor está arrancando en lugar de dejarle ante una pantalla que no responde.

// A partir de este tiempo sin respuesta se muestra el aviso (una API despierta responde en menos de un segundo)
export const AVISO_ARRANQUE_MS = 2500;

// Tiempo máximo de espera de la petición de comprobación (un arranque en frío completo)
export const ESPERA_MAXIMA_ARRANQUE_MS = 90_000;

// Ejecuta la operación y llama a alTardar si pasa avisoMs sin terminar; alTerminar se llama siempre al acabar (bien o mal)
export async function vigilarLentitud<T>(
  operacion: () => Promise<T>,
  alTardar: () => void,
  alTerminar: () => void,
  avisoMs: number = AVISO_ARRANQUE_MS
): Promise<T> {
  const temporizador = setTimeout(alTardar, avisoMs);
  try {
    return await operacion();
  } finally {
    clearTimeout(temporizador);
    alTerminar();
  }
}
