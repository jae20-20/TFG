// Reglas de presentación del ciclo de vida de una cita (el servidor es quien las valida)

export type EstadoCita = 'pendiente' | 'confirmada' | 'completada' | 'no_presentada' | 'cancelada';
export type AccionEstadoCita = 'confirmar' | 'rechazar' | 'completar' | 'no-presentada';

const ETIQUETAS_ESTADO: Record<string, string> = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  completada: 'Completada',
  no_presentada: 'No presentada',
  cancelada: 'Cancelada'
};

const ETIQUETAS_CANCELACION: Record<string, string> = {
  rechazada: 'Rechazada',
  expirada: 'Expirada'
};

export function etiquetaEstadoCita(cita: any): string {
  if (cita?.estado === 'cancelada') {
    return ETIQUETAS_CANCELACION[cita.motivoCancelacion] || ETIQUETAS_ESTADO['cancelada'];
  }
  return ETIQUETAS_ESTADO[cita?.estado] || '';
}

export function inicioCita(cita: any): Date | null {
  if (!cita?.fecha || !cita?.horaInicio) return null;
  const inicio = new Date(`${String(cita.fecha).slice(0, 10)}T${cita.horaInicio}`);
  return Number.isNaN(inicio.getTime()) ? null : inicio;
}

export function citaHaEmpezado(cita: any): boolean {
  const inicio = inicioCita(cita);
  return inicio !== null && inicio.getTime() <= Date.now();
}

// Momento en que una reserva pendiente se cancela sola: el plazo de respuesta o la hora de la cita
export function limiteRespuesta(cita: any): Date | null {
  const inicio = inicioCita(cita);
  const expira = cita?.expiraEn ? new Date(cita.expiraEn) : null;
  if (!inicio || !expira) return inicio || expira;
  return expira < inicio ? expira : inicio;
}

export const esPendiente = (cita: any) => cita?.estado === 'pendiente';

export function esPendienteVigente(cita: any): boolean {
  const limite = limiteRespuesta(cita);
  return esPendiente(cita) && (!limite || limite.getTime() > Date.now());
}

export const admitePago = (cita: any) => cita?.estado === 'confirmada' || cita?.estado === 'completada';

export const admiteAsistencia = (cita: any) => cita?.estado === 'confirmada' && citaHaEmpezado(cita);

export const admiteCancelacionPersonal = (cita: any) => cita?.estado === 'confirmada';
