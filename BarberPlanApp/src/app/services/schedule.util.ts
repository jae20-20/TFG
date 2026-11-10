export interface ScheduleSlot {
  start: string;
  end: string;
}

export interface DaySchedule {
  closed: boolean;
  slots: ScheduleSlot[];
  absences: ScheduleSlot[];
}

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function toMinutes(hhmm: string): number {
  const [h, m] = (hhmm || '').split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function toHHMM(minutes: number): string {
  const clamped = Math.max(0, Math.round(minutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Una barbería recién registrada nace con la plantilla semanal vacía: sin franjas no hay huecos que reservar.
 * Devuelve true si el horario cargado no tiene ninguna franja semanal ni excepción con horario propio.
 * Con un horario aún sin cargar (null) devuelve false, para no avisar por error.
 */
export function horarioSinFranjas(horario: any): boolean {
  if (!horario) return false;
  const dias = horario.weeklyTemplate ? Object.values(horario.weeklyTemplate) : [];
  const hayFranjaSemanal = dias.some((franjas) => Array.isArray(franjas) && franjas.length > 0);
  const hayExcepcionAbierta = Array.isArray(horario.exceptions)
    && horario.exceptions.some((ex: any) => ex.type === 'custom' && ex.start && ex.end);
  return !hayFranjaSemanal && !hayExcepcionAbierta;
}

function parseDateKeyLocal(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Resuelve el horario efectivo de un día concreto combinando el horario
 * personal de un barbero (si tiene uno habilitado) con el horario global
 * de la barbería. Replica exactamente la cascada de precedencia que ya
 * usaban `updateScheduleLimits()` en las páginas de calendario de admin y
 * barbero, para no cambiar el comportamiento de la vista mensual.
 *
 * `sujeto` es el barbero seleccionado (admin) o el usuario autenticado
 * (barbero), con la forma `{ horarioPersonal, diasLibres, vacaciones }`.
 */
export function resolveDaySchedule(dateKey: string, horarioBarberia: any, sujeto: any): DaySchedule {
  if (!dateKey) {
    return { closed: true, slots: [], absences: [] };
  }

  const absences: ScheduleSlot[] = [];
  if (sujeto?.horarioPersonal?.exceptions && Array.isArray(sujeto.horarioPersonal.exceptions)) {
    for (const ex of sujeto.horarioPersonal.exceptions) {
      if (ex.date === dateKey && ex.type === 'custom' && ex.isAbsence && ex.start && ex.end) {
        absences.push({ start: ex.start, end: ex.end });
      }
    }
  }

  const dateObj = parseDateKeyLocal(dateKey);
  const dayKey = DAY_NAMES[dateObj.getDay()];

  // 1. Horario personal del barbero (tiene prioridad, no cae al global)
  if (sujeto?.horarioPersonal?.enabled) {
    const exceptions = Array.isArray(sujeto.horarioPersonal.exceptions) ? sujeto.horarioPersonal.exceptions : [];

    const closedEx = exceptions.find((ex: any) => ex.date === dateKey && ex.type === 'closed');
    if (closedEx) {
      return { closed: true, slots: [], absences };
    }

    const customExceptions = exceptions
      .filter((ex: any) => ex.date === dateKey && ex.type === 'custom' && !ex.isAbsence && ex.start && ex.end)
      .slice()
      .sort((a: any, b: any) => a.start.localeCompare(b.start));
    if (customExceptions.length > 0) {
      return {
        closed: false,
        slots: customExceptions.map((ex: any) => ({ start: ex.start, end: ex.end })),
        absences
      };
    }

    const weeklyTemplate = sujeto.horarioPersonal.weeklyTemplate;
    if (weeklyTemplate && Array.isArray(weeklyTemplate[dayKey])) {
      const slots = [...weeklyTemplate[dayKey]].sort((a: any, b: any) => a.start.localeCompare(b.start));
      return { closed: slots.length === 0, slots, absences };
    }
  }

  // 2. Horario global de la barbería (fallback)
  if (!horarioBarberia) {
    return { closed: true, slots: [], absences };
  }

  if (Array.isArray(horarioBarberia.exceptions)) {
    const closedEx = horarioBarberia.exceptions.find((ex: any) => ex.date === dateKey && ex.type === 'closed');
    if (closedEx) {
      return { closed: true, slots: [], absences };
    }

    const customExceptions = horarioBarberia.exceptions
      .filter((ex: any) => ex.date === dateKey && ex.type === 'custom' && ex.start && ex.end)
      .slice()
      .sort((a: any, b: any) => a.start.localeCompare(b.start));
    if (customExceptions.length > 0) {
      return {
        closed: false,
        slots: customExceptions.map((ex: any) => ({ start: ex.start, end: ex.end })),
        absences
      };
    }
  }

  const weeklyTemplate = horarioBarberia.weeklyTemplate;
  if (weeklyTemplate && Array.isArray(weeklyTemplate[dayKey])) {
    const slots = [...weeklyTemplate[dayKey]].sort((a: any, b: any) => a.start.localeCompare(b.start));
    return { closed: slots.length === 0, slots, absences };
  }

  return { closed: true, slots: [], absences };
}
