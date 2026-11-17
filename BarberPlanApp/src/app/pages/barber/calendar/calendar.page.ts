import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController, AlertController } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { ApiService } from '../../../services/api.service';
import { CitaAccionesService } from '../../../services/cita-acciones.service';
import {
  AccionEstadoCita,
  admiteCancelacionPersonal,
  admitePago,
  esPendienteVigente,
  etiquetaEstadoCita,
  inicialesCliente
} from '../../../services/cita-estado.util';
import { CitaAccionesComponent } from '../../../components/cita-acciones/cita-acciones.component';
import { PendientesAprobacionComponent } from '../../../components/pendientes-aprobacion/pendientes-aprobacion.component';
import { resolveDaySchedule, ScheduleSlot } from '../../../services/schedule.util';
import { WeekAgendaComponent, WeekAgendaDay } from '../../../components/week-agenda/week-agenda.component';
import { MonthCalendarComponent, CalendarDay } from '../../../components/month-calendar/month-calendar.component';

const CALENDAR_VIEW_STORAGE_KEY = 'barberplan_calendar_view';

@Component({
  selector: 'app-barber-calendar',
  templateUrl: './calendar.page.html',
  styleUrls: ['./calendar.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, WeekAgendaComponent, MonthCalendarComponent, CitaAccionesComponent, PendientesAprobacionComponent]
})
export class BarberCalendarPage implements OnInit {
  readonly inicialesCliente = inicialesCliente;
  user: any = null;
  citas: any[] = [];
  pendientes: any[] = [];
  loadingCitas = false;
  calendarError = '';
  calendarDays: CalendarDay[] = [];
  currentMonthDate = new Date();
  calendarMonthLabel = '';
  selectedDateKey = this.toDateKey(new Date());
  selectedDateLabel = '';
  selectedDayAppointments: any[] = [];
  expandedCitaId: string | null = null;

  // Horario
  horarioBarberia: any = null;
  dayOpenTime: string | null = null;
  dayCloseTime: string | null = null;
  scheduleLimitsText: string | null = null;
  barberAbsence: { start: string, end: string } | null = null;
  daySlots: ScheduleSlot[] = [];
  dayAbsences: ScheduleSlot[] = [];

  // Vista del calendario (mes / semana)
  viewMode: 'month' | 'week' = this.loadSavedViewMode();
  weekDays: WeekAgendaDay[] = [];
  weekRangeLabel = '';

  // Modal para añadir cita manual
  isNewCitaModalOpen = false;
  serviciosBarberia: any[] = [];
  selectedServicioIds: string[] = [];
  selectedHoraInicio: string = '';
  horasDisponibles: string[] = [];
  loadingHoras = false;
  clienteNombreManual: string = '';
  correoClienteManual = '';
  errorCorreoManual = '';
  creandoCita = false;

  constructor(
    private apiService: ApiService,
    private storage: Storage,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private cdr: ChangeDetectorRef,
    private citaAcciones: CitaAccionesService
  ) { }

  readonly etiquetaEstado = etiquetaEstadoCita;
  readonly admitePago = admitePago;
  readonly admiteCancelacionPersonal = admiteCancelacionPersonal;

  async ngOnInit() {
    await this.storage.create();
    this.user = await this.storage.get('user');
    
    this.currentMonthDate = new Date();
    this.selectedDateKey = this.toDateKey(new Date());
    this.buildCalendar(this.currentMonthDate);
    
    await this.loadBarberiaCitas();
  }

  getUserId(): string {
    return this.user?.id || this.user?._id || '';
  }

  getBarberiaId(): string {
    return this.user?.barberiaId || this.user?.barberia?._id || (typeof this.user?.barberia === 'string' ? this.user.barberia : '') || '';
  }

  async loadBarberiaCitas() {
    if (!this.getUserId()) {
      this.calendarError = 'No se ha encontrado el usuario autenticado.';
      this.citas = [];
      this.updateSelectedDayAppointments();
      return;
    }

    this.loadingCitas = true;
    this.calendarError = '';

    try {
      const citas = await this.apiService.getCitasBarbero();
      this.citas = Array.isArray(citas) ? citas : [];
      this.pendientes = this.citas.filter(esPendienteVigente);

      try {
        const profile = await this.apiService.getMyProfile();
        if (profile) {
          this.user = profile;
          await this.storage.set('user', this.user);
        }
      } catch (err) {
        console.warn('No se pudo cargar el perfil del usuario:', err);
      }

      // Cargar horario (necesitamos un endpoint u obtenerlo, probemos getMyHorario() que usa barberiaId del usuario)
      // wait, the apiService has getMyHorario() which gets the schedule for the authenticated user's barberia. Since barber belongs to barberia, let's try it.
      try {
        const response = await this.apiService.getMyHorario();
        this.horarioBarberia = response?.horario || response?.schedule || response || null;
      } catch (err) {
        console.warn('No se pudo cargar el horario:', err);
      }

      this.buildCalendar(this.currentMonthDate);
    } catch (error) {
      console.error('Error al cargar citas del barbero:', error);
      this.calendarError = 'No se han podido cargar tus citas.';
      this.citas = [];
      this.buildCalendar(this.currentMonthDate);
    } finally {
      this.loadingCitas = false;
      this.updateSelectedDayAppointments();
      this.cdr.detectChanges();
    }
  }

  changeMonth(step: number) {
    const nextDate = new Date(this.currentMonthDate);
    nextDate.setMonth(nextDate.getMonth() + step);
    this.currentMonthDate = nextDate;
    this.selectedDateKey = this.toDateKey(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
    this.buildCalendar(this.currentMonthDate);
    this.updateSelectedDayAppointments();
  }

  selectDay(day: CalendarDay) {
    this.selectedDateKey = day.key;
    if (!day.inCurrentMonth) {
      this.currentMonthDate = new Date(day.date.getFullYear(), day.date.getMonth(), 1);
    }
    this.buildCalendar(this.currentMonthDate);
    this.updateSelectedDayAppointments();
  }

  private loadSavedViewMode(): 'month' | 'week' {
    const saved = localStorage.getItem(CALENDAR_VIEW_STORAGE_KEY);
    return saved === 'month' ? 'month' : 'week';
  }

  setViewMode(mode: 'month' | 'week') {
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    localStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, mode);
    if (mode === 'week') {
      this.buildWeek();
    }
  }

  selectWeekDay(dateKey: string) {
    this.selectedDateKey = dateKey;
    const parsed = this.parseDateKey(dateKey);
    if (parsed.getMonth() !== this.currentMonthDate.getMonth() || parsed.getFullYear() !== this.currentMonthDate.getFullYear()) {
      this.currentMonthDate = new Date(parsed.getFullYear(), parsed.getMonth(), 1);
    }
    this.buildCalendar(this.currentMonthDate);
    this.updateSelectedDayAppointments();
  }

  changeWeek(step: number) {
    const current = this.parseDateKey(this.selectedDateKey);
    current.setDate(current.getDate() + step * 7);
    this.selectWeekDay(this.toDateKey(current));
  }

  private buildWeek() {
    const selected = this.parseDateKey(this.selectedDateKey);
    const mondayOffset = (selected.getDay() + 6) % 7;
    const monday = new Date(selected);
    monday.setDate(selected.getDate() - mondayOffset);
    const todayKey = this.toDateKey(new Date());
    const weekdayLabels = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

    this.weekDays = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      const key = this.toDateKey(date);

      return {
        date,
        key,
        dayNumber: date.getDate(),
        weekdayLabel: weekdayLabels[index],
        isToday: key === todayKey,
        isSelected: key === this.selectedDateKey,
        closed: this.isDayClosed(key),
        appointmentCount: this.getAppointmentsByDateKey(key).length
      };
    });

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    this.weekRangeLabel = this.formatWeekRange(monday, sunday);
  }

  private formatWeekRange(start: Date, end: Date): string {
    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    const monthYear = new Intl.DateTimeFormat('es-ES', { month: 'short', year: 'numeric' }).format(end);

    if (sameMonth) {
      return `${start.getDate()} – ${end.getDate()} ${monthYear}`;
    }

    const startLabel = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(start);
    return `${startLabel} – ${end.getDate()} ${monthYear}`;
  }

  private buildCalendar(baseDate: Date) {
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const mondayOffset = (firstDayOfMonth.getDay() + 6) % 7;
    const startDate = new Date(year, month, 1 - mondayOffset);
    const todayKey = this.toDateKey(new Date());

    this.calendarMonthLabel = new Intl.DateTimeFormat('es-ES', {
      month: 'long',
      year: 'numeric'
    }).format(firstDayOfMonth);

    const firstDayKey = this.toDateKey(firstDayOfMonth);
    if (!this.isDateInCurrentMonth(this.selectedDateKey, year, month)) {
      this.selectedDateKey = firstDayKey;
    }

    this.calendarDays = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + index);
      const key = this.toDateKey(date);
      const appointments = this.getAppointmentsByDateKey(key);

      return {
        date,
        key,
        dayNumber: date.getDate(),
        inCurrentMonth: date.getMonth() === month,
        isToday: key === todayKey,
        isSelected: key === this.selectedDateKey,
        hasAppointments: appointments.length > 0,
        appointmentCount: appointments.length,
        isClosed: this.isDayClosed(key),
        isSpecialOpen: this.isSpecialOpenDay(key)
      };
    });

    this.selectedDateLabel = new Intl.DateTimeFormat('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    }).format(this.parseDateKey(this.selectedDateKey));
  }

  private updateSelectedDayAppointments() {
    this.selectedDayAppointments = this.getAppointmentsByDateKey(this.selectedDateKey);
    this.selectedDateLabel = new Intl.DateTimeFormat('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    }).format(this.parseDateKey(this.selectedDateKey));

    this.updateScheduleLimits();
    this.buildCalendar(this.currentMonthDate);
    if (this.viewMode === 'week') {
      this.buildWeek();
    }
  }

  // Resuelve el horario efectivo del día seleccionado (horario personal del
  // barbero + horario global) y deriva de él los campos que usa el template
  // (envolvente + texto) y los que necesita la vista semanal (franjas y ausencias).
  private updateScheduleLimits() {
    if (!this.selectedDateKey) {
      this.dayOpenTime = null;
      this.dayCloseTime = null;
      this.scheduleLimitsText = null;
      this.barberAbsence = null;
      this.daySlots = [];
      this.dayAbsences = [];
      return;
    }

    const resolved = resolveDaySchedule(this.selectedDateKey, this.horarioBarberia, this.user);

    this.daySlots = resolved.slots;
    this.dayAbsences = resolved.absences;
    this.barberAbsence = resolved.absences.length > 0 ? resolved.absences[0] : null;

    if (resolved.slots.length > 0) {
      this.dayOpenTime = resolved.slots[0].start;
      this.dayCloseTime = resolved.slots[resolved.slots.length - 1].end;
      this.scheduleLimitsText = resolved.slots.map(slot => `${slot.start} a ${slot.end}`).join('  |  ');
    } else {
      this.dayOpenTime = null;
      this.dayCloseTime = null;
      this.scheduleLimitsText = null;
    }
  }

  private getAppointmentsByDateKey(dateKey: string) {
    return this.citas
      .filter((cita) => this.toDateKey(cita.fecha) === dateKey && cita.estado !== 'cancelada')
      .slice()
      .sort((a, b) => `${a.horaInicio}`.localeCompare(`${b.horaInicio}`));
  }

  private isDateInCurrentMonth(dateKey: string, year: number, month: number) {
    const date = this.parseDateKey(dateKey);
    return date.getFullYear() === year && date.getMonth() === month;
  }

  isDayClosed(dateKey: string): boolean {
    if (!this.user) return false;

    // Nivel 1: Vacaciones y diasLibres del usuario
    if (this.user.diasLibres && this.user.diasLibres.includes(dateKey)) return true;
    if (this.user.vacaciones) {
      for (const vac of this.user.vacaciones) {
        if (dateKey >= vac.fechaInicio && dateKey <= vac.fechaFin) return true;
      }
    }

    // Nivel 2: Cierre global
    if (this.horarioBarberia && this.horarioBarberia.exceptions) {
      const globalEx = this.horarioBarberia.exceptions.find((e: any) => e.date === dateKey && e.type === 'closed');
      if (globalEx) return true;
    }

    // Nivel 3: Excepción personal custom o closed
    if (this.user.horarioPersonal && this.user.horarioPersonal.enabled) {
      if (this.user.horarioPersonal.exceptions) {
        const customEx = this.user.horarioPersonal.exceptions.find((e: any) => e.date === dateKey);
        if (customEx) {
           if (customEx.type === 'closed') return true;
           if (customEx.type === 'custom' && !customEx.isAbsence) return false;
        }
      }
      // Nivel 4: Plantilla semanal del barbero
      const dateObj = this.parseDateKey(dateKey);
      const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      const dayKey = dayNames[dateObj.getDay()];
      const weeklyTemplate = this.user.horarioPersonal.weeklyTemplate;
      if (weeklyTemplate && weeklyTemplate[dayKey] && Array.isArray(weeklyTemplate[dayKey])) {
        return weeklyTemplate[dayKey].length === 0;
      }
    }

    // Nivel 5: Horario global fallback
    if (!this.horarioBarberia) return false;
    const dateObj = this.parseDateKey(dateKey);
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayKey = dayNames[dateObj.getDay()];
    const weeklyTemplate = this.horarioBarberia.weeklyTemplate;
    if (weeklyTemplate && weeklyTemplate[dayKey] && Array.isArray(weeklyTemplate[dayKey])) {
      return weeklyTemplate[dayKey].length === 0;
    }

    return false;
  }

  private isSpecialOpenDay(dateKey: string): boolean {
    if (!this.user) return false;
    if (this.user.horarioPersonal && this.user.horarioPersonal.enabled) {
      if (this.user.horarioPersonal.exceptions) {
        const customEx = this.user.horarioPersonal.exceptions.find((e: any) => e.date === dateKey && e.type === 'custom' && !e.isAbsence);
        if (customEx) {
           const dateObj = this.parseDateKey(dateKey);
           const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
           const dayKey = dayNames[dateObj.getDay()];
           const weeklyTemplate = this.user.horarioPersonal.weeklyTemplate;
           if (weeklyTemplate && weeklyTemplate[dayKey] && Array.isArray(weeklyTemplate[dayKey])) {
             if (weeklyTemplate[dayKey].length === 0) return true;
           }
        }
      }
    }
    return false;
  }

  async openNewCitaModal() {
    const userId = this.getUserId();
    const barberiaId = this.getBarberiaId();
    if (!userId || !this.selectedDateKey || !barberiaId) {
      const toast = await this.toastCtrl.create({ message: 'No se ha podido identificar tu barbería o fecha seleccionada.', duration: 2000, color: 'warning' });
      toast.present();
      return;
    }
    this.selectedServicioIds = [];
    this.selectedHoraInicio = '';
    this.clienteNombreManual = '';
    this.correoClienteManual = '';
    this.errorCorreoManual = '';
    this.horasDisponibles = [];
    this.isNewCitaModalOpen = true;

    try {
      this.serviciosBarberia = await this.apiService.getServiciosBarberia(barberiaId);
      await this.loadHorasDisponibles();
    } catch (e) {
      console.error('Error cargando datos para nueva cita:', e);
      const toast = await this.toastCtrl.create({ message: 'Error al cargar servicios o disponibilidad.', duration: 2000, color: 'danger' });
      toast.present();
    }
  }

  async loadHorasDisponibles() {
    const userId = this.getUserId();
    const barberiaId = this.getBarberiaId();
    if (!userId || !this.selectedDateKey || !barberiaId) return;
    this.loadingHoras = true;
    try {
      const res = await this.apiService.getDisponibilidadBarbero(userId, this.selectedDateKey, barberiaId, true, this.duracionManual());
      this.horasDisponibles = res?.horariosDisponibles || [];
    } catch (e) {
      console.error('Error al cargar horas disponibles:', e);
      this.horasDisponibles = [];
    } finally {
      this.loadingHoras = false;
    }
  }

  // Duración total de los servicios elegidos en la cita manual (por defecto, un hueco)
  duracionManual(): number | undefined {
    const total = this.serviciosBarberia
      .filter(s => this.selectedServicioIds.includes(s._id))
      .reduce((suma, s) => suma + (Number(s.duracion) || 0), 0);
    return total || undefined;
  }

  precioManual(): number {
    return this.serviciosBarberia
      .filter(s => this.selectedServicioIds.includes(s._id))
      .reduce((suma, s) => suma + (Number(s.precio) || 0), 0);
  }

  async onServiciosManualChange() {
    await this.loadHorasDisponibles();
    if (!this.horasDisponibles.includes(this.selectedHoraInicio)) {
      this.selectedHoraInicio = '';
    }
  }

  async confirmarCitaManual() {
    if (this.selectedServicioIds.length === 0 || !this.selectedHoraInicio) {
      const toast = await this.toastCtrl.create({ message: 'Por favor, selecciona un servicio y una hora.', duration: 2000, color: 'warning' });
      toast.present();
      return;
    }

    this.creandoCita = true;
    this.errorCorreoManual = '';
    try {
      await this.apiService.crearCitaManual({
        barberoId: this.getUserId(),
        servicioIds: this.selectedServicioIds,
        fecha: this.selectedDateKey,
        horaInicio: this.selectedHoraInicio,
        clienteNombre: this.clienteNombreManual?.trim() || undefined,
        correoCliente: this.correoClienteManual?.trim() || undefined
      });

      const vinculada = Boolean(this.correoClienteManual?.trim());
      const toast = await this.toastCtrl.create({
        message: vinculada ? 'Cita añadida y asignada a la cuenta del cliente.' : 'Cita añadida correctamente.',
        duration: 2000,
        color: 'success'
      });
      toast.present();
      this.isNewCitaModalOpen = false;
      await this.loadBarberiaCitas();
    } catch (e: any) {
      console.error('Error al crear cita:', e);
      // Correo sin cuenta de cliente: el modal sigue abierto para corregirlo o borrarlo y crear la cita solo con el nombre
      if (e?.status === 404 && this.correoClienteManual?.trim()) {
        this.errorCorreoManual = `${e?.error?.error || 'No se ha encontrado un cliente con ese correo'}. Revísalo o déjalo vacío para crear la cita solo con el nombre.`;
        return;
      }
      if (e?.status === 400 && this.correoClienteManual?.trim() && /correo/i.test(e?.error?.error || '')) {
        this.errorCorreoManual = e.error.error;
        return;
      }
      const errMsg = e?.error?.error || 'No se pudo crear la cita.';
      const toast = await this.toastCtrl.create({ message: errMsg, duration: 3000, color: 'danger' });
      toast.present();
    } finally {
      this.creandoCita = false;
    }
  }

  cancelNewCitaModal() {
    this.isNewCitaModalOpen = false;
  }

  private parseDateKey(dateKey: string) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private toDateKey(dateValue: string | Date) {
    const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
    const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return `${normalizedDate.getFullYear()}-${String(normalizedDate.getMonth() + 1).padStart(2, '0')}-${String(normalizedDate.getDate()).padStart(2, '0')}`;
  }

  async onTogglePago(cita: any, event?: any) {
    if (event) {
      event.stopPropagation();
    }
    const nuevoPagado = !cita.pagado;
    const importe = cita.importePagado !== undefined ? cita.importePagado : (cita.servicioPrecio || 0);
    try {
      const respuesta = await this.apiService.updateCitaPago(cita._id || cita.id, nuevoPagado, importe);
      cita.pagado = nuevoPagado;
      cita.estado = respuesta?.cita?.estado ?? cita.estado;
      if (nuevoPagado) {
        const toast = await this.toastCtrl.create({ message: 'Cita marcada como pagada.', duration: 1500, color: 'success' });
        toast.present();
      } else {
        const toast = await this.toastCtrl.create({ message: 'Cita marcada como pendiente.', duration: 1500, color: 'medium' });
        toast.present();
      }
    } catch (e) {
      console.error('Error al actualizar pago:', e);
      const toast = await this.toastCtrl.create({ message: 'Error al actualizar el estado de pago.', duration: 2000, color: 'danger' });
      toast.present();
      if (event?.target) {
        event.target.checked = cita.pagado;
      }
    }
  }

  async modificarImporte(cita: any, event?: any) {
    if (event) {
      event.stopPropagation();
    }
    const importeActual = cita.importePagado !== undefined ? cita.importePagado : (cita.servicioPrecio || 0);
    const alert = await this.alertCtrl.create({
      header: 'Modificar Importe',
      subHeader: `${cita.servicioNombre || cita.servicio?.nombre || 'Servicio'}`,
      inputs: [
        {
          name: 'importe',
          type: 'number',
          placeholder: 'Ej: 15',
          value: importeActual,
          attributes: {
            step: 'any',
            min: '0'
          }
        }
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Guardar',
          handler: async (data) => {
            const num = parseFloat(data.importe);
            if (isNaN(num) || num < 0) {
              const toast = await this.toastCtrl.create({ message: 'Introduce un importe válido.', duration: 2000, color: 'warning' });
              toast.present();
              return false;
            }
            try {
              await this.apiService.updateCitaPago(cita._id || cita.id, true, num);
              cita.pagado = true;
              cita.importePagado = num;
              const toast = await this.toastCtrl.create({ message: 'Importe actualizado a ' + num + '€', duration: 1500, color: 'success' });
              toast.present();
            } catch (e) {
              console.error('Error al actualizar importe:', e);
              const toast = await this.toastCtrl.create({ message: 'No se pudo actualizar el importe.', duration: 2000, color: 'danger' });
              toast.present();
            }
            return true;
          }
        }
      ],
      cssClass: 'premium-alert'
    });
    await alert.present();
  }

  isCitaExpanded(cita: any) {
    return this.expandedCitaId === (cita._id || cita.id);
  }

  onWeekTogglePago({ cita, event }: { cita: any; event: any }) {
    this.onTogglePago(cita, event);
  }

  onWeekEditImporte(cita: any) {
    this.modificarImporte(cita);
  }

  onWeekCancelCita(cita: any) {
    this.confirmarCancelarCita(cita);
  }

  toggleCitaDetalle(cita: any) {
    const citaId = cita._id || cita.id;
    this.expandedCitaId = this.expandedCitaId === citaId ? null : citaId;
  }

  async onCambiarEstado(cita: any, accion: AccionEstadoCita) {
    if (await this.citaAcciones.ejecutar(cita, accion)) {
      await this.recargarCitas();
    }
  }

  // Lleva el calendario al día de la cita y despliega su detalle
  irACita(cita: any) {
    this.expandedCitaId = cita._id || cita.id;
    this.selectWeekDay(this.toDateKey(cita.fecha));
  }

  private async recargarCitas() {
    try {
      const citas = await this.apiService.getCitasBarbero();
      this.citas = Array.isArray(citas) ? citas : [];
      this.pendientes = this.citas.filter(esPendienteVigente);
      this.updateSelectedDayAppointments();
    } catch (error) {
      console.error('Error al recargar las citas:', error);
    }
  }

  async confirmarCancelarCita(cita: any, event?: any) {
    if (event) {
      event.stopPropagation();
    }
    const alert = await this.alertCtrl.create({
      header: 'Cancelar Cita',
      message: `¿Estás seguro de que deseas cancelar la cita de <b>${cita.cliente?.nombre || cita.clienteNombre || 'Reserva manual'}</b> a las <b>${cita.horaInicio}</b>?`,
      buttons: [
        { text: 'Volver', role: 'cancel' },
        {
          text: 'Sí, Cancelar',
          role: 'destructive',
          handler: async () => {
            try {
              await this.apiService.cancelarCita(cita._id || cita.id);
              const toast = await this.toastCtrl.create({ message: 'Cita cancelada correctamente.', duration: 2000, color: 'success' });
              toast.present();
              await this.loadBarberiaCitas();
            } catch (e) {
              console.error('Error al cancelar cita:', e);
              const toast = await this.toastCtrl.create({ message: 'No se pudo cancelar la cita.', duration: 2000, color: 'danger' });
              toast.present();
            }
          }
        }
      ],
      cssClass: 'premium-alert'
    });
    await alert.present();
  }
}
