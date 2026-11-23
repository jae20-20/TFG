import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { ScheduleSlot, toHHMM, toMinutes } from '../../services/schedule.util';
import { AccionEstadoCita, admiteCancelacionPersonal, admiteEdicion, admitePago, etiquetaEstadoCita } from '../../services/cita-estado.util';
import { CitaAccionesComponent } from '../cita-acciones/cita-acciones.component';

export interface MovimientoCita {
  cita: any;
  fecha: string;
  horaInicio: string;
}

interface EstadoArrastre {
  cita: any;
  pointerId: number;
  pointerType: string;
  inicioX: number;
  inicioY: number;
  inicioMin: number;
  duracionMin: number;
  activo: boolean;
  temporizador: ReturnType<typeof setTimeout> | null;
  minutoDestino: number;
  diaDestino: string | null;
}

export interface WeekAgendaDay {
  key: string;
  dayNumber: number;
  weekdayLabel: string;
  isToday: boolean;
  isSelected: boolean;
  closed: boolean;
  appointmentCount: number;
}

interface HourMark {
  top: number;
  label: string;
}

interface Band {
  top: number;
  height: number;
}

interface PositionedCita {
  cita: any;
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
}

const HOUR_HEIGHT = 64; // px por hora
const PX_PER_MIN = HOUR_HEIGHT / 60;
const MIN_BLOCK_HEIGHT = 38; // px mínimos para que quepan las dos líneas (hora y cliente-servicio)
const DEFAULT_START_MIN = 8 * 60;
const DEFAULT_END_MIN = 21 * 60;
// Misma granularidad que los huecos del servidor (INTERVALO_HUECOS_MIN)
const REJILLA_MIN = 30;
// En táctil el arrastre empieza con pulsación larga para no chocar con el scroll
const PULSACION_LARGA_MS = 450;
const TOLERANCIA_TACTIL_PX = 8;
const UMBRAL_RATON_PX = 4;

@Component({
  selector: 'app-week-agenda',
  standalone: true,
  imports: [CommonModule, IonicModule, CitaAccionesComponent],
  templateUrl: './week-agenda.component.html',
  styleUrls: ['./week-agenda.component.scss']
})
export class WeekAgendaComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() weekDays: WeekAgendaDay[] = [];
  @Input() citas: any[] = [];
  @Input() slots: ScheduleSlot[] = [];
  @Input() absences: ScheduleSlot[] = [];
  @Input() edicionHabilitada = false;

  @Output() daySelected = new EventEmitter<string>();
  @Output() togglePago = new EventEmitter<{ cita: any; event: any }>();
  @Output() editImporte = new EventEmitter<any>();
  @Output() cancelCita = new EventEmitter<any>();
  @Output() cambiarEstado = new EventEmitter<{ cita: any; accion: AccionEstadoCita }>();
  @Output() moverCita = new EventEmitter<MovimientoCita>();
  @Output() editarCita = new EventEmitter<any>();

  readonly etiquetaEstado = etiquetaEstadoCita;
  readonly admitePago = admitePago;
  readonly admiteCancelacionPersonal = admiteCancelacionPersonal;
  readonly admiteEdicion = admiteEdicion;

  arrastrandoId: string | null = null;
  vistaPrevia: { top: number; height: number; etiqueta: string } | null = null;
  diaDestino: string | null = null;
  private arrastre: EstadoArrastre | null = null;
  private ignorarClic = false;
  // Necesita un listener no pasivo para poder cancelar el scroll mientras se arrastra con el dedo
  private readonly bloquearDesplazamiento = (event: TouchEvent) => {
    if (this.arrastre?.activo && event.cancelable) event.preventDefault();
  };

  gridStart = DEFAULT_START_MIN;
  gridEnd = DEFAULT_END_MIN;
  gridHeight = (DEFAULT_END_MIN - DEFAULT_START_MIN) * PX_PER_MIN;
  hourMarks: HourMark[] = [];
  closedBands: Band[] = [];
  absenceBands: Band[] = [];
  positionedCitas: PositionedCita[] = [];
  nowTop: number | null = null;
  isDayEntirelyClosed = false;

  isDetailOpen = false;
  selectedCita: any = null;

  private nowInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private host: ElementRef<HTMLElement>) {
    this.nowInterval = setInterval(() => this.updateNowLine(), 60000);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['citas'] || changes['slots'] || changes['absences'] || changes['weekDays']) {
      this.recompute();
    }
  }

  ngAfterViewInit() {
    this.host.nativeElement.addEventListener('touchmove', this.bloquearDesplazamiento, { passive: false });
  }

  ngOnDestroy() {
    if (this.nowInterval) {
      clearInterval(this.nowInterval);
    }
    this.host.nativeElement.removeEventListener('touchmove', this.bloquearDesplazamiento);
    this.terminarArrastre();
  }

  onDayClick(dateKey: string) {
    this.daySelected.emit(dateKey);
  }

  openDetail(cita: any) {
    this.selectedCita = cita;
    this.isDetailOpen = true;
  }

  onBlockClick(cita: any) {
    if (this.ignorarClic) return;
    this.openDetail(cita);
  }

  onEditarClick() {
    if (!this.selectedCita) return;
    const cita = this.selectedCita;
    this.closeDetail();
    this.editarCita.emit(cita);
  }

  esArrastrable(cita: any): boolean {
    return this.edicionHabilitada && admiteEdicion(cita);
  }

  // ==================== ARRASTRE ====================
  // Soltar sobre la rejilla cambia la hora; soltar sobre un día de la tira cambia el día y conserva la hora

  onBlockPointerDown(event: PointerEvent, item: PositionedCita) {
    if (!this.esArrastrable(item.cita) || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const inicio = toMinutes(item.cita.horaInicio);
    const fin = item.cita.horaFin ? toMinutes(item.cita.horaFin) : inicio + (Number(item.cita.servicioDuracion) || REJILLA_MIN);
    this.terminarArrastre();
    this.arrastre = {
      cita: item.cita,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      inicioX: event.clientX,
      inicioY: event.clientY,
      inicioMin: inicio,
      duracionMin: Math.max(fin - inicio, REJILLA_MIN),
      activo: false,
      temporizador: null,
      minutoDestino: inicio,
      diaDestino: null
    };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    if (event.pointerType === 'mouse') {
      event.preventDefault();
    } else {
      this.arrastre.temporizador = setTimeout(() => this.activarArrastre(), PULSACION_LARGA_MS);
    }
  }

  onBlockPointerMove(event: PointerEvent) {
    const arrastre = this.arrastre;
    if (!arrastre || event.pointerId !== arrastre.pointerId) return;
    const distancia = Math.hypot(event.clientX - arrastre.inicioX, event.clientY - arrastre.inicioY);

    if (!arrastre.activo) {
      if (arrastre.pointerType === 'mouse') {
        if (distancia > UMBRAL_RATON_PX) this.activarArrastre();
      } else if (distancia > TOLERANCIA_TACTIL_PX) {
        this.terminarArrastre();
      }
      if (!this.arrastre?.activo) return;
    }

    event.preventDefault();
    this.actualizarVistaPrevia(event.clientX, event.clientY);
  }

  onBlockPointerUp(event: PointerEvent) {
    const arrastre = this.arrastre;
    if (!arrastre || event.pointerId !== arrastre.pointerId) return;
    if (arrastre.activo) {
      const fecha = arrastre.diaDestino ?? this.diaSeleccionado();
      const horaInicio = toHHMM(arrastre.minutoDestino);
      const cambia = fecha !== String(arrastre.cita.fecha).slice(0, 10) || horaInicio !== arrastre.cita.horaInicio;
      this.ignorarClic = true;
      setTimeout(() => (this.ignorarClic = false));
      if (fecha && cambia) this.moverCita.emit({ cita: arrastre.cita, fecha, horaInicio });
    }
    this.terminarArrastre();
  }

  onBlockPointerCancel() {
    this.terminarArrastre();
  }

  private activarArrastre() {
    if (!this.arrastre) return;
    this.arrastre.activo = true;
    this.arrastrandoId = this.arrastre.cita._id;
    navigator.vibrate?.(15);
    this.actualizarVistaPrevia(this.arrastre.inicioX, this.arrastre.inicioY);
  }

  private actualizarVistaPrevia(x: number, y: number) {
    const arrastre = this.arrastre;
    if (!arrastre) return;
    const bajoPuntero = document.elementFromPoint(x, y) as HTMLElement | null;
    const dia = bajoPuntero?.closest<HTMLElement>('[data-dia]')?.dataset['dia'] ?? null;

    let minuto = arrastre.inicioMin;
    if (!dia) {
      const desplazado = arrastre.inicioMin + (y - arrastre.inicioY) / PX_PER_MIN;
      const ajustado = Math.round(desplazado / REJILLA_MIN) * REJILLA_MIN;
      minuto = Math.min(Math.max(ajustado, this.gridStart), this.gridEnd - arrastre.duracionMin);
    }
    arrastre.minutoDestino = minuto;
    arrastre.diaDestino = dia && dia !== this.diaSeleccionado() ? dia : null;
    this.diaDestino = arrastre.diaDestino;

    const diaTira = arrastre.diaDestino ? this.weekDays.find(d => d.key === arrastre.diaDestino) : null;
    const rango = `${toHHMM(minuto)}-${toHHMM(minuto + arrastre.duracionMin)}`;
    this.vistaPrevia = {
      top: (minuto - this.gridStart) * PX_PER_MIN,
      height: Math.max(arrastre.duracionMin * PX_PER_MIN, MIN_BLOCK_HEIGHT),
      etiqueta: diaTira ? `${diaTira.weekdayLabel} ${diaTira.dayNumber} · ${rango}` : rango
    };
  }

  private terminarArrastre() {
    if (this.arrastre?.temporizador) clearTimeout(this.arrastre.temporizador);
    this.arrastre = null;
    this.arrastrandoId = null;
    this.vistaPrevia = null;
    this.diaDestino = null;
  }

  private diaSeleccionado(): string {
    return this.weekDays.find(day => day.isSelected)?.key ?? '';
  }

  closeDetail() {
    this.isDetailOpen = false;
    this.selectedCita = null;
  }

  onTogglePagoChange(event: any) {
    if (!this.selectedCita) return;
    this.togglePago.emit({ cita: this.selectedCita, event });
  }

  onEditImporteClick() {
    if (!this.selectedCita) return;
    const cita = this.selectedCita;
    this.closeDetail();
    this.editImporte.emit(cita);
  }

  onCancelClick() {
    if (!this.selectedCita) return;
    const cita = this.selectedCita;
    this.closeDetail();
    this.cancelCita.emit(cita);
  }

  onAccionEstado(accion: AccionEstadoCita) {
    if (!this.selectedCita) return;
    const cita = this.selectedCita;
    this.closeDetail();
    this.cambiarEstado.emit({ cita, accion });
  }

  getClienteNombre(cita: any): string {
    return `${cita?.cliente?.nombre || cita?.clienteNombre || 'Reserva manual'} ${cita?.cliente?.apellido || ''}`.trim();
  }

  getServicioNombre(cita: any): string {
    return cita?.servicioNombre || cita?.servicio?.nombre || 'Corte';
  }

  getPrecio(cita: any): number {
    return cita?.importePagado !== undefined ? cita.importePagado : (cita?.servicioPrecio || 0);
  }

  private recompute() {
    const range = this.computeGridRange();
    this.gridStart = range.start;
    this.gridEnd = range.end;
    this.gridHeight = Math.max((this.gridEnd - this.gridStart) * PX_PER_MIN, HOUR_HEIGHT);
    this.hourMarks = this.buildHourMarks();
    this.closedBands = this.computeClosedBands();
    this.absenceBands = this.computeAbsenceBands();
    this.positionedCitas = this.layoutCitas();
    this.isDayEntirelyClosed = this.slots.length === 0;
    this.updateNowLine();
  }

  private computeGridRange(): { start: number; end: number } {
    const hasSlots = this.slots.length > 0;
    const hasCitas = this.citas.length > 0;

    if (!hasSlots && !hasCitas) {
      return { start: DEFAULT_START_MIN, end: DEFAULT_END_MIN };
    }

    let start = hasSlots ? toMinutes(this.slots[0].start) : DEFAULT_START_MIN;
    let end = hasSlots ? toMinutes(this.slots[this.slots.length - 1].end) : DEFAULT_END_MIN;

    for (const cita of this.citas) {
      if (cita.horaInicio) start = Math.min(start, toMinutes(cita.horaInicio));
      if (cita.horaFin) end = Math.max(end, toMinutes(cita.horaFin));
    }

    start = Math.floor(start / 60) * 60;
    end = Math.ceil(end / 60) * 60;
    if (end <= start) end = start + 60;
    return { start, end };
  }

  private buildHourMarks(): HourMark[] {
    const marks: HourMark[] = [];
    for (let minute = this.gridStart; minute <= this.gridEnd; minute += 60) {
      marks.push({ top: (minute - this.gridStart) * PX_PER_MIN, label: toHHMM(minute) });
    }
    return marks;
  }

  private computeClosedBands(): Band[] {
    const bands: { start: number; end: number }[] = [];

    if (this.slots.length === 0) {
      bands.push({ start: this.gridStart, end: this.gridEnd });
    } else {
      const sorted = [...this.slots].sort((a, b) => a.start.localeCompare(b.start));
      const firstStart = toMinutes(sorted[0].start);
      if (firstStart > this.gridStart) {
        bands.push({ start: this.gridStart, end: firstStart });
      }

      for (let i = 0; i < sorted.length - 1; i++) {
        const gapStart = toMinutes(sorted[i].end);
        const gapEnd = toMinutes(sorted[i + 1].start);
        if (gapEnd > gapStart) {
          bands.push({ start: gapStart, end: gapEnd });
        }
      }

      const lastEnd = toMinutes(sorted[sorted.length - 1].end);
      if (lastEnd < this.gridEnd) {
        bands.push({ start: lastEnd, end: this.gridEnd });
      }
    }

    return bands.map(band => ({
      top: (band.start - this.gridStart) * PX_PER_MIN,
      height: (band.end - band.start) * PX_PER_MIN
    }));
  }

  private computeAbsenceBands(): Band[] {
    return this.absences
      .map(absence => {
        const start = Math.max(toMinutes(absence.start), this.gridStart);
        const end = Math.min(toMinutes(absence.end), this.gridEnd);
        return { top: (start - this.gridStart) * PX_PER_MIN, height: (end - start) * PX_PER_MIN };
      })
      .filter(band => band.height > 0);
  }

  private layoutCitas(): PositionedCita[] {
    const items = this.citas
      .filter(cita => cita.horaInicio)
      .map(cita => {
        const start = toMinutes(cita.horaInicio);
        const durationMin = cita.servicioDuracion ? Number(cita.servicioDuracion) : undefined;
        const endFromHoraFin = cita.horaFin ? toMinutes(cita.horaFin) : undefined;
        const end = endFromHoraFin ?? (durationMin ? start + durationMin : start + 30);
        return { cita, start, end: Math.max(end, start + 10) };
      })
      .sort((a, b) => a.start - b.start || a.end - b.end);

    const laneLastEnd: number[] = [];
    const laneOf: number[] = [];

    items.forEach((item, index) => {
      let lane = laneLastEnd.findIndex(end => end <= item.start);
      if (lane === -1) {
        lane = laneLastEnd.length;
        laneLastEnd.push(item.end);
      } else {
        laneLastEnd[lane] = item.end;
      }
      laneOf[index] = lane;
    });

    return items.map((item, index) => {
      let maxLane = laneOf[index];
      for (let j = 0; j < items.length; j++) {
        if (j === index) continue;
        const other = items[j];
        const overlaps = other.start < item.end && item.start < other.end;
        if (overlaps) {
          maxLane = Math.max(maxLane, laneOf[j]);
        }
      }

      const totalLanes = maxLane + 1;
      const widthPct = 100 / totalLanes;

      return {
        cita: item.cita,
        top: (item.start - this.gridStart) * PX_PER_MIN,
        height: Math.max((item.end - item.start) * PX_PER_MIN, MIN_BLOCK_HEIGHT),
        leftPct: widthPct * laneOf[index],
        widthPct
      };
    });
  }

  private updateNowLine() {
    const selectedDay = this.weekDays.find(day => day.isSelected);
    if (!selectedDay?.isToday) {
      this.nowTop = null;
      return;
    }

    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    if (minutes < this.gridStart || minutes > this.gridEnd) {
      this.nowTop = null;
      return;
    }

    this.nowTop = (minutes - this.gridStart) * PX_PER_MIN;
  }
}
