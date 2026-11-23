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
  expirada: 'Expirada',
  barberia_eliminada: 'Barbería eliminada'
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

// Cita del filtro «Próximas» del cliente: no cancelada y que aún no ha empezado (sin fecha cuenta como próxima).
// La usan Mis citas y el aviso del panel Explorar, para que ambos cuenten lo mismo
export function esCitaProxima(cita: any, ahora: Date = new Date()): boolean {
  if (cita?.estado === 'cancelada') return false;
  if (!cita?.fecha) return true;
  const fechaHora = new Date(`${cita.fecha}T${cita.horaInicio || cita.horaFin || '00:00'}`);
  return Number.isNaN(fechaHora.getTime()) || fechaHora.getTime() >= ahora.getTime();
}

export function esPendienteVigente(cita: any): boolean {
  const limite = limiteRespuesta(cita);
  return esPendiente(cita) && (!limite || limite.getTime() > Date.now());
}

// ==================== AVISOS AL CLIENTE (RF12) ====================
// El servidor deja `avisoCliente: { tipo, creadoEn }` en la cita cuando el personal acepta, rechaza o cancela una reserva,
// cuando caduca sin respuesta, cuando el personal responde la reseña del cliente (respuesta_resena), cuando le asigna
// una cita manual a su cuenta (nueva) o cuando mueve o cambia su cita (modificada, con `anterior: { fecha, horaInicio }`).
// Solo se muestran dentro de la aplicación (sin push ni correo).

export type TipoAvisoCita = 'confirmada' | 'rechazada' | 'expirada' | 'cancelada' | 'respuesta_resena' | 'nueva' | 'modificada';

export interface AvisoCita {
  citaId: string;
  tipo: TipoAvisoCita;
  creadoEn: string;
  texto: string;
}

// «dd/mm» de una fecha «YYYY-MM-DD»
const diaMes = (fecha: string) => `${String(fecha).slice(8, 10)}/${String(fecha).slice(5, 7)}`;

const nombreBarberiaCita = (cita: any) => cita?.barberia?.nombre || cita?.barberiaNombre || 'la barbería';

export function textoAvisoCita(cita: any): string {
  const barberia = nombreBarberiaCita(cita);
  const cuando = `del ${diaMes(cita?.fecha)} a las ${cita?.horaInicio}`;
  switch (cita?.avisoCliente?.tipo as TipoAvisoCita) {
    case 'confirmada': return `${barberia} ha aceptado tu reserva ${cuando}.`;
    case 'rechazada': return `${barberia} ha rechazado tu reserva ${cuando}.`;
    case 'expirada': return `Tu reserva en ${barberia} ${cuando} ha caducado sin respuesta.`;
    case 'cancelada':
      return cita?.motivoCancelacion === 'barberia_eliminada'
        ? `${barberia} ya no está en BarberPlan: se ha cancelado tu cita ${cuando}.`
        : `${barberia} ha cancelado tu cita ${cuando}.`;
    // Si el cliente ya la canceló, el aviso de la cita nueva deja de tener sentido y no se muestra
    case 'nueva': return cita?.estado === 'confirmada' ? `Tienes una cita nueva en ${barberia} el ${diaMes(cita?.fecha)} a las ${cita?.horaInicio}.` : '';
    case 'respuesta_resena': return `${barberia} ha respondido a tu reseña de la cita del ${diaMes(cita?.fecha)}.`;
    // Si se canceló después de moverla, el aviso de cancelación ya la cubre
    case 'modificada': {
      if (cita?.estado === 'cancelada') return '';
      const anterior = cita?.avisoCliente?.anterior;
      const desde = anterior?.fecha ? `del ${diaMes(anterior.fecha)} a las ${anterior.horaInicio}` : cuando;
      return `${barberia} ha cambiado tu cita ${desde}: ahora es el ${diaMes(cita?.fecha)} a las ${cita?.horaInicio}.`;
    }
    default: return '';
  }
}

// ==================== AVISOS AL BARBERO ====================

export type TipoAvisoBarbero = 'modificada' | 'reasignada_entrante' | 'reasignada_saliente';

export interface AvisoBarbero {
  citaId: string;
  tipo: TipoAvisoBarbero;
  creadoEn: string;
  fecha: string;
  horaInicio: string;
  horaFin?: string;
  servicioNombre?: string;
  estado?: EstadoCita;
  anterior?: { fecha: string; horaInicio: string };
}

export function textoAvisoBarbero(aviso: Pick<AvisoBarbero, 'tipo' | 'fecha' | 'horaInicio' | 'anterior'>): string {
  const ahora = `el ${diaMes(aviso.fecha)} a las ${aviso.horaInicio}`;
  const antes = aviso.anterior?.fecha ? `el ${diaMes(aviso.anterior.fecha)} a las ${aviso.anterior.horaInicio}` : ahora;
  switch (aviso.tipo) {
    case 'modificada': return `El dueño ha movido tu cita de ${antes} a ${ahora}.`;
    case 'reasignada_entrante': return `El dueño te ha pasado una cita: ${ahora}.`;
    case 'reasignada_saliente': return `La cita de ${antes} ya no es tuya: el dueño se la ha pasado a otro barbero.`;
    default: return '';
  }
}

// ==================== EDICIÓN DESDE LA AGENDA ====================

export function admiteEdicion(cita: any): boolean {
  return (cita?.estado === 'pendiente' || cita?.estado === 'confirmada') && !citaHaEmpezado(cita);
}

export interface EdicionCita {
  fecha?: string;
  horaInicio?: string;
  barberoId?: string;
  servicioIds?: string[];
}

// Citas con aviso sin ver, de la más reciente a la más antigua
export function avisosDeCitas(citas: any[]): AvisoCita[] {
  return (Array.isArray(citas) ? citas : [])
    .filter((cita) => cita?.avisoCliente?.tipo && textoAvisoCita(cita))
    .map((cita) => ({ citaId: String(cita._id), tipo: cita.avisoCliente.tipo as TipoAvisoCita, creadoEn: cita.avisoCliente.creadoEn, texto: textoAvisoCita(cita) }))
    .sort((a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime());
}

export const HORAS_RECORDATORIO = 24;

export interface RecordatorioCita {
  citaId: string;
  texto: string;
}

// Recordatorio de la próxima cita confirmada si empieza dentro de las próximas 24 h. Se calcula en la app a partir de
// las citas ya cargadas; como no hay notificaciones push, solo se ve al abrir la aplicación
export function recordatorioProximaCita(citas: any[], ahora: Date = new Date()): RecordatorioCita | null {
  const limite = ahora.getTime() + HORAS_RECORDATORIO * 60 * 60 * 1000;
  const proximas = (Array.isArray(citas) ? citas : [])
    .filter((cita) => cita?.estado === 'confirmada')
    .map((cita) => ({ cita, inicio: inicioCita(cita) }))
    .filter((c): c is { cita: any; inicio: Date } => c.inicio !== null && c.inicio.getTime() > ahora.getTime() && c.inicio.getTime() <= limite)
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  if (proximas.length === 0) return null;

  const { cita, inicio } = proximas[0];
  const esHoy = inicio.toDateString() === ahora.toDateString();
  return { citaId: String(cita._id), texto: `Tu próxima cita es ${esHoy ? 'hoy' : 'mañana'} a las ${cita.horaInicio} en ${nombreBarberiaCita(cita)}.` };
}

// Iniciales del cliente de una cita para la agenda del personal (en lugar de su avatar, que se repetiría en cada cita).
// Cliente eliminado o cita manual: se usan las del nombre guardado en la cita; sin nombre, «CL»
export function inicialesCliente(cita: any): string {
  const nombre = (cita?.cliente?.nombre || '').trim();
  const apellido = (cita?.cliente?.apellido || '').trim();
  if (nombre || apellido) return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
  const palabras = String(cita?.clienteNombre || '').trim().split(/\s+/).filter(Boolean);
  return palabras.slice(0, 2).map((p: string) => p.charAt(0)).join('').toUpperCase() || 'CL';
}

export const admitePago = (cita: any) => cita?.estado === 'confirmada' || cita?.estado === 'completada';

export const admiteAsistencia = (cita: any) => cita?.estado === 'confirmada' && citaHaEmpezado(cita);

export const admiteCancelacionPersonal = (cita: any) => cita?.estado === 'confirmada';
