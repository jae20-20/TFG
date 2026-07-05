import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController, AlertController } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { ApiService } from '../../../services/api.service';

interface CalendarDay {
  date: Date;
  key: string;
  dayNumber: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  hasAppointments: boolean;
  appointmentCount: number;
  isClosed: boolean;
  isSpecialOpen?: boolean;
}

@Component({
  selector: 'app-barber-calendar',
  templateUrl: './calendar.page.html',
  styleUrls: ['./calendar.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class BarberCalendarPage implements OnInit {
  user: any = null;
  citas: any[] = [];
  loadingCitas = false;
  calendarError = '';
  calendarDays: CalendarDay[] = [];
  currentMonthDate = new Date();
  calendarMonthLabel = '';
  selectedDateKey = this.toDateKey(new Date());
  selectedDateLabel = '';
  selectedDayAppointments: any[] = [];

  // Horario
  horarioBarberia: any = null;
  dayOpenTime: string | null = null;
  dayCloseTime: string | null = null;
  scheduleLimitsText: string | null = null;
  barberAbsence: { start: string, end: string } | null = null;

  // Modal para añadir cita manual
  isNewCitaModalOpen = false;
  serviciosBarberia: any[] = [];
  selectedServicioId: string = '';
  selectedHoraInicio: string = '';
  horasDisponibles: string[] = [];
  loadingHoras = false;
  clienteNombreManual: string = '';
  creandoCita = false;

  constructor(
    private apiService: ApiService,
    private storage: Storage,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController
  ) { }

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
  }
  private updateScheduleLimits() {
    this.dayOpenTime = null;
    this.dayCloseTime = null;
    this.scheduleLimitsText = null;
    this.barberAbsence = null;

    if (!this.selectedDateKey) return;

    if (this.user && this.user.horarioPersonal && this.user.horarioPersonal.exceptions) {
      const bEx = this.user.horarioPersonal.exceptions.find((ex: any) => ex.date === this.selectedDateKey);
      if (bEx && bEx.type === 'custom' && bEx.isAbsence) {
        this.barberAbsence = { start: bEx.start, end: bEx.end };
      }
    }

    const dateObj = this.parseDateKey(this.selectedDateKey);
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayKey = dayNames[dateObj.getDay()];

    if (this.user && this.user.horarioPersonal && this.user.horarioPersonal.enabled) {
      if (this.user.horarioPersonal.exceptions && Array.isArray(this.user.horarioPersonal.exceptions)) {
        const closedEx = this.user.horarioPersonal.exceptions.find((ex: any) => ex.date === this.selectedDateKey && ex.type === 'closed');
        if (closedEx) return;

        const customExceptions = this.user.horarioPersonal.exceptions.filter((ex: any) => ex.date === this.selectedDateKey && ex.type === 'custom' && !ex.isAbsence && ex.start && ex.end);
        if (customExceptions.length > 0) {
           customExceptions.sort((a: any, b: any) => a.start.localeCompare(b.start));
           this.dayOpenTime = customExceptions[0].start;
           this.dayCloseTime = customExceptions[customExceptions.length - 1].end;
           this.scheduleLimitsText = customExceptions.map((ex: any) => `${ex.start} a ${ex.end}`).join('  |  ');
           return;
        }
      }

      const weeklyTemplate = this.user.horarioPersonal.weeklyTemplate;
      if (weeklyTemplate && weeklyTemplate[dayKey] && Array.isArray(weeklyTemplate[dayKey])) {
        const slots = [...weeklyTemplate[dayKey]].sort((a, b) => a.start.localeCompare(b.start));
        if (slots.length > 0) {
          this.dayOpenTime = slots[0].start;
          this.dayCloseTime = slots[slots.length - 1].end;
          this.scheduleLimitsText = slots.map(slot => `${slot.start} a ${slot.end}`).join('  |  ');
          return;
        } else {
          return;
        }
      }
    }

    if (!this.horarioBarberia) return;
   
    if (this.horarioBarberia.exceptions && Array.isArray(this.horarioBarberia.exceptions)) {
      const closedEx = this.horarioBarberia.exceptions.find((ex: any) => ex.date === this.selectedDateKey && ex.type === 'closed');
      if (closedEx) return;

      const customExceptions = this.horarioBarberia.exceptions.filter((ex: any) => ex.date === this.selectedDateKey && ex.type === 'custom' && ex.start && ex.end);
      if (customExceptions.length > 0) {
         customExceptions.sort((a: any, b: any) => a.start.localeCompare(b.start));
         this.dayOpenTime = customExceptions[0].start;
         this.dayCloseTime = customExceptions[customExceptions.length - 1].end;
         this.scheduleLimitsText = customExceptions.map((ex: any) => `${ex.start} a ${ex.end}`).join('  |  ');
         return;
      }
    }

    const weeklyTemplate = this.horarioBarberia.weeklyTemplate;
    if (weeklyTemplate && weeklyTemplate[dayKey] && Array.isArray(weeklyTemplate[dayKey])) {
      const slots = [...weeklyTemplate[dayKey]].sort((a, b) => a.start.localeCompare(b.start));
      if (slots.length > 0) {
        this.dayOpenTime = slots[0].start;
        this.dayCloseTime = slots[slots.length - 1].end;
        this.scheduleLimitsText = slots.map(slot => `${slot.start} a ${slot.end}`).join('  |  ');
      }
    }
  }

  private getAppointmentsByDateKey(dateKey: string) {
    return this.citas
      .filter((cita) => this.toDateKey(cita.fecha) === dateKey)
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
    this.selectedServicioId = '';
    this.selectedHoraInicio = '';
    this.clienteNombreManual = '';
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
      const res = await this.apiService.getDisponibilidadBarbero(userId, this.selectedDateKey, barberiaId);
      this.horasDisponibles = res?.horariosDisponibles || [];
    } catch (e) {
      console.error('Error al cargar horas disponibles:', e);
      this.horasDisponibles = [];
    } finally {
      this.loadingHoras = false;
    }
  }

  async confirmarCitaManual() {
    if (!this.selectedServicioId || !this.selectedHoraInicio) {
      const toast = await this.toastCtrl.create({ message: 'Por favor, selecciona un servicio y una hora.', duration: 2000, color: 'warning' });
      toast.present();
      return;
    }

    this.creandoCita = true;
    try {
      await this.apiService.crearCitaManual({
        barberoId: this.getUserId(),
        servicioId: this.selectedServicioId,
        fecha: this.selectedDateKey,
        horaInicio: this.selectedHoraInicio,
        clienteNombre: this.clienteNombreManual?.trim() || undefined
      });

      const toast = await this.toastCtrl.create({ message: 'Cita añadida correctamente.', duration: 2000, color: 'success' });
      toast.present();
      this.isNewCitaModalOpen = false;
      await this.loadBarberiaCitas();
    } catch (e: any) {
      console.error('Error al crear cita:', e);
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
      await this.apiService.updateCitaPago(cita._id || cita.id, nuevoPagado, importe);
      cita.pagado = nuevoPagado;
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
