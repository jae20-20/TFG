import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertController, IonicModule, ToastController } from '@ionic/angular';
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
}

@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.page.html',
  styleUrls: ['./calendar.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class CalendarPage implements OnInit {
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
  
  // Agrupamiento por barberos
  teamBarbers: any[] = [];
  selectedBarberId: string = '';

  // Horario
  horarioBarberia: any = null;
  dayOpenTime: string | null = null;
  dayCloseTime: string | null = null;
  scheduleLimitsText: string | null = null;
  barberAbsence: { start: string, end: string } | null = null;

  constructor(
    private apiService: ApiService,
    private storage: Storage,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController
  ) { }

  async ngOnInit() {
    await this.storage.create();
    this.user = await this.storage.get('user');
    
    this.currentMonthDate = new Date();
    this.selectedDateKey = this.toDateKey(new Date());
    this.buildCalendar(this.currentMonthDate);
    
    await this.loadBarberiaCitas();
  }

  async loadBarberiaCitas() {
    if (!this.user?.barberiaId) {
      this.calendarError = 'No se ha encontrado la barbería asociada al administrador.';
      this.citas = [];
      this.updateSelectedDayAppointments();
      return;
    }

    this.loadingCitas = true;
    this.calendarError = '';

    try {
      // Cargar barberos de la barbería
      const barbers = await this.apiService.getBarberosBarberia(this.user.barberiaId);
      if (Array.isArray(barbers)) {
        
        // Formatear la lista de barberos extraídos de la base de datos (excluyendo al admin por si acaso viene duplicado)
        const otherBarbers = barbers
          .filter(b => b._id !== this.user.id)
          .map(b => ({
            ...b,
            displayName: `${b.nombre} ${b.apellido || ''}`.trim()
          }));

        // Crear explícitamente el objeto del administrador
        const adminBarber = {
          _id: this.user.id,
          nombre: this.user.nombre,
          apellido: this.user.apellido,
          displayName: `${this.user.nombre} (Tú)`,
        };

        // El admin siempre será el primero
        this.teamBarbers = [adminBarber, ...otherBarbers];

        this.teamBarbers = [adminBarber, ...otherBarbers];

        if (this.teamBarbers.length > 0) {
          this.selectedBarberId = this.teamBarbers[0]._id;
        }
      }

      // Cargar citas
      const citas = await this.apiService.getCitasBarberia(this.user.barberiaId);
      this.citas = Array.isArray(citas) ? citas : [];
      
      // Cargar horario
      try {
        const response = await this.apiService.getMyHorario();
        this.horarioBarberia = response?.horario || response?.schedule || response || null;
      } catch (err) {
        console.warn('No se pudo cargar el horario:', err);
      }

      this.buildCalendar(this.currentMonthDate);
    } catch (error) {
      console.error('Error al cargar citas de barbería:', error);
      this.calendarError = 'No se han podido cargar las citas de la barbería.';
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

  onBarberChange() {
    this.buildCalendar(this.currentMonthDate);
    this.updateSelectedDayAppointments();
  }

  isGlobalDayClosed(dateKey: string): boolean {
    return this.isDayClosed(dateKey);
  }

  async toggleCerrarDiaGlobal() {
    if (!this.selectedDateKey || !this.horarioBarberia) return;

    if (!this.horarioBarberia.exceptions) {
      this.horarioBarberia.exceptions = [];
    }
    
    const isClosed = this.isDayClosed(this.selectedDateKey);

    if (isClosed) {
      this.horarioBarberia.exceptions = this.horarioBarberia.exceptions.filter(
        (ex: any) => !(ex.date === this.selectedDateKey && ex.type === 'closed')
      );
    } else {
      this.horarioBarberia.exceptions.push({
        date: this.selectedDateKey,
        type: 'closed'
      });
    }

    try {
      await this.apiService.updateMyHorario({ horario: this.horarioBarberia });
      
      const toast = await this.toastCtrl.create({
        message: isClosed ? 'Día abierto para todos.' : 'Día cerrado para todos.',
        duration: 2000, color: 'success'
      });
      toast.present();
      
      this.buildCalendar(this.currentMonthDate);
      this.updateSelectedDayAppointments();
    } catch (error) {
      const toast = await this.toastCtrl.create({
        message: 'Error al actualizar el horario global.',
        duration: 2000, color: 'danger'
      });
      toast.present();
    }
  }

  getSelectedBarberName(): string {
    const barber = this.teamBarbers.find(b => b._id === this.selectedBarberId);
    return barber ? barber.displayName : '';
  }

  getEmptyMessage(): string {
    if (this.isGlobalDayClosed(this.selectedDateKey)) {
      return 'Barbería cerrada este día.';
    }
    
    const barber = this.teamBarbers.find(b => b._id === this.selectedBarberId);
    if (barber) {
      if (barber.diasLibres && barber.diasLibres.includes(this.selectedDateKey)) {
        return `Día cerrado para ${barber.displayName}.`;
      }
      if (barber.vacaciones) {
        for (const vac of barber.vacaciones) {
          if (this.selectedDateKey >= vac.fechaInicio && this.selectedDateKey <= vac.fechaFin) {
            return `Vacaciones de ${barber.displayName}.`;
          }
        }
      }
    }
    
    if (!this.dayOpenTime) {
      return 'Cerrado por horario habitual.';
    }

    return 'No hay citas para este día.';
  }

  async gestionarDiaBarbero() {
    const alert = await this.alertCtrl.create({
      header: 'Gestionar Día',
      message: `¿Qué deseas hacer para ${this.getSelectedBarberName()} el ${this.selectedDateLabel}?`,
      cssClass: 'premium-alert',
      buttons: [
        {
          text: 'Cerrar Parcialmente',
          handler: () => {
            this.pedirHorasCierreParcial();
          }
        },
        {
          text: 'Cerrar Día Entero',
          handler: () => {
            this.cerrarDiaEnteroBarbero();
          }
        },
        {
          text: 'Abrir Día',
          handler: () => {
            this.abrirDiaBarbero();
          }
        },
        { text: 'Cancelar', role: 'cancel' }
      ]
    });
    await alert.present();
  }

  async pedirHorasCierreParcial() {
    const alert = await this.alertCtrl.create({
      header: 'Cierre Parcial',
      message: 'Introduce las horas en las que el barbero estará AUSENTE (Cerrado).',
      cssClass: 'premium-alert',
      inputs: [
        {
          name: 'start',
          type: 'time',
          placeholder: 'Hora de inicio (ej. 16:00)'
        },
        {
          name: 'end',
          type: 'time',
          placeholder: 'Hora de fin (ej. 16:30)'
        }
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Guardar',
          handler: (data) => {
            if (data.start && data.end) {
              this.aplicarCierreParcial(data.start, data.end);
            }
          }
        }
      ]
    });
    await alert.present();
  }

  async aplicarCierreParcial(start: string, end: string) {
    const barber = this.teamBarbers.find(b => b._id === this.selectedBarberId);
    if (!barber) return;

    if (!barber.horarioPersonal) {
      barber.horarioPersonal = {
        enabled: true,
        timezone: 'Europe/Madrid',
        weeklyTemplate: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
        exceptions: []
      };
    }
    
    if (!barber.horarioPersonal.exceptions) {
      barber.horarioPersonal.exceptions = [];
    }
    
    // Si estaba cerrado el día entero, lo abrimos
    if (barber.diasLibres && barber.diasLibres.includes(this.selectedDateKey)) {
      barber.diasLibres = barber.diasLibres.filter((d: string) => d !== this.selectedDateKey);
    }
    
    barber.horarioPersonal.enabled = true; // Forzamos a que tenga horario personal
    
    // Buscar si ya tiene excepcion y sobreescribir
    const exIndex = barber.horarioPersonal.exceptions.findIndex((ex: any) => ex.date === this.selectedDateKey);
    const newEx = { date: this.selectedDateKey, type: 'custom', start, end, isAbsence: true };
    if (exIndex >= 0) {
      barber.horarioPersonal.exceptions[exIndex] = newEx;
    } else {
      barber.horarioPersonal.exceptions.push(newEx);
    }

    try {
      await this.apiService.updateBarbero(this.selectedBarberId, { 
        diasLibres: barber.diasLibres,
        horarioPersonal: barber.horarioPersonal 
      });
      const toast = await this.toastCtrl.create({
        message: 'Cierre parcial aplicado al barbero.',
        duration: 2000, color: 'success'
      });
      toast.present();
      this.buildCalendar(this.currentMonthDate);
      this.updateSelectedDayAppointments();
    } catch (e) {
      const toast = await this.toastCtrl.create({
        message: 'Error al actualizar el horario.',
        duration: 2000, color: 'danger'
      });
      toast.present();
    }
  }

  async cerrarDiaEnteroBarbero() {
    const barber = this.teamBarbers.find(b => b._id === this.selectedBarberId);
    if (!barber) return;
    if (!barber.diasLibres) barber.diasLibres = [];
    if (!barber.diasLibres.includes(this.selectedDateKey)) {
      barber.diasLibres.push(this.selectedDateKey);
      await this.saveBarberDiasLibres(barber, 'Día cerrado para el barbero.');
    } else {
      const toast = await this.toastCtrl.create({
        message: 'El día ya estaba cerrado.',
        duration: 2000, color: 'warning'
      });
      toast.present();
    }
  }

  async abrirDiaBarbero() {
    const barber = this.teamBarbers.find(b => b._id === this.selectedBarberId);
    if (!barber) return;
    if (barber.diasLibres && barber.diasLibres.includes(this.selectedDateKey)) {
      barber.diasLibres = barber.diasLibres.filter((d: string) => d !== this.selectedDateKey);
      await this.saveBarberDiasLibres(barber, 'Día abierto para el barbero.');
    } else {
      const toast = await this.toastCtrl.create({
        message: 'El día ya estaba abierto.',
        duration: 2000, color: 'warning'
      });
      toast.present();
    }
  }

  private async saveBarberDiasLibres(barber: any, successMessage: string) {
    try {
      await this.apiService.updateBarbero(this.selectedBarberId, { diasLibres: barber.diasLibres });
      const toast = await this.toastCtrl.create({
        message: successMessage,
        duration: 2000, color: 'success'
      });
      toast.present();
      this.buildCalendar(this.currentMonthDate);
      this.updateSelectedDayAppointments();
    } catch (e) {
      const toast = await this.toastCtrl.create({
        message: 'Error al actualizar el horario.',
        duration: 2000, color: 'danger'
      });
      toast.present();
    }
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
        isClosed: this.isBarberDayClosed(key)
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
  //anyadido para las lineas de los limites de cada cita en calendario
  private updateScheduleLimits() {
    this.dayOpenTime = null;
    this.dayCloseTime = null;
    this.scheduleLimitsText = null;
    this.barberAbsence = null;

    if (!this.horarioBarberia || !this.selectedDateKey) return;

    // Verificar si el barbero tiene un cierre parcial
    const barber = this.teamBarbers.find(b => b._id === this.selectedBarberId);
    if (barber && barber.horarioPersonal && barber.horarioPersonal.exceptions) {
      const bEx = barber.horarioPersonal.exceptions.find((ex: any) => ex.date === this.selectedDateKey);
      if (bEx && bEx.type === 'custom' && bEx.isAbsence) {
        this.barberAbsence = { start: bEx.start, end: bEx.end };
      }
    }

    const dateObj = this.parseDateKey(this.selectedDateKey);
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayKey = dayNames[dateObj.getDay()];

   
    if (this.horarioBarberia.exceptions && Array.isArray(this.horarioBarberia.exceptions)) {
      const exception = this.horarioBarberia.exceptions.find((ex: any) => ex.date === this.selectedDateKey);
      if (exception) {
        if (exception.type === 'closed') {
           // Cerrado todo el día
           return;
        } else if (exception.type === 'custom' && exception.start && exception.end) {
           this.dayOpenTime = exception.start;
           this.dayCloseTime = exception.end;
           this.scheduleLimitsText = `${exception.start} - ${exception.end}`;
           return;
        }
      }
    }

    // 2. Regular schedule
    const weeklyTemplate = this.horarioBarberia.weeklyTemplate;
    if (weeklyTemplate && weeklyTemplate[dayKey] && Array.isArray(weeklyTemplate[dayKey])) {
      const slots = [...weeklyTemplate[dayKey]].sort((a, b) => a.start.localeCompare(b.start));
      if (slots.length > 0) {
        this.dayOpenTime = slots[0].start;
        this.dayCloseTime = slots[slots.length - 1].end;
        
        // Formatear el texto completo con parones
        this.scheduleLimitsText = slots.map(slot => `${slot.start} a ${slot.end}`).join('  |  ');
      }
    }
  }

  getFilteredAppointments() {
    if (!this.selectedBarberId) {
      return [];
    }
    return this.selectedDayAppointments.filter(cita => cita.barbero?._id === this.selectedBarberId);
  }

  getTimelineItems() {
    const citas = this.getFilteredAppointments();
    const limits: string[] = [];
    
    const dateObj = this.parseDateKey(this.selectedDateKey);
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayKey = dayNames[dateObj.getDay()];

    if (this.horarioBarberia) {
      if (this.horarioBarberia.exceptions && Array.isArray(this.horarioBarberia.exceptions)) {
        const exception = this.horarioBarberia.exceptions.find((ex: any) => ex.date === this.selectedDateKey);
        if (exception && exception.type === 'custom' && exception.start && exception.end) {
           limits.push(exception.start);
           limits.push(exception.end);
        }
      }
      
      if (limits.length === 0) {
        const weeklyTemplate = this.horarioBarberia.weeklyTemplate;
        if (weeklyTemplate && weeklyTemplate[dayKey] && Array.isArray(weeklyTemplate[dayKey])) {
          const slots = [...weeklyTemplate[dayKey]].sort((a, b) => a.start.localeCompare(b.start));
          if (slots.length > 0) {
            for (let i = 0; i < slots.length; i++) {
              limits.push(slots[i].start);
              if (i === slots.length - 1) {
                limits.push(slots[i].end);
              }
            }
          }
        }
      }
    }
    
    limits.sort();
    
    const events: any[] = [];
    for (const limit of limits) {
      events.push({ type: 'delimiter', time: limit });
    }
    for (const cita of citas) {
      events.push({ type: 'appointment', time: cita.horaInicio, cita });
    }
    
    events.sort((a, b) => {
      if (a.time === b.time) {
         if (a.type === 'delimiter' && b.type === 'appointment') {
            const isLast = limits.length > 0 && limits[limits.length - 1] === a.time;
            return isLast ? 1 : -1;
         }
         if (b.type === 'delimiter' && a.type === 'appointment') {
            const isLast = limits.length > 0 && limits[limits.length - 1] === b.time;
            return isLast ? -1 : 1;
         }
      }
      return a.time.localeCompare(b.time);
    });
    
    return events;
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

  private isDayClosed(dateKey: string): boolean {
    if (!this.horarioBarberia) return false;

    const dateObj = this.parseDateKey(dateKey);
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayKey = dayNames[dateObj.getDay()];

    // 1. Verificar excepciones
    if (this.horarioBarberia.exceptions && Array.isArray(this.horarioBarberia.exceptions)) {
      const exception = this.horarioBarberia.exceptions.find((ex: any) => ex.date === dateKey);
      if (exception && exception.type === 'closed') {
        return true;
      }
    }

    // 2. Verificar horario habitual
    const weeklyTemplate = this.horarioBarberia.weeklyTemplate;
    if (weeklyTemplate && weeklyTemplate[dayKey] && Array.isArray(weeklyTemplate[dayKey])) {
      if (weeklyTemplate[dayKey].length === 0) {
        return true;
      }
    }

    return false;
  }

  isBarberDayClosed(dateKey: string): boolean {
    const barber = this.teamBarbers.find(b => b._id === this.selectedBarberId);
    if (barber) {
      if (barber.diasLibres && barber.diasLibres.includes(dateKey)) {
        return true;
      }
      if (barber.vacaciones) {
        for (const vac of barber.vacaciones) {
          if (dateKey >= vac.fechaInicio && dateKey <= vac.fechaFin) return true;
        }
      }
    }
    return this.isDayClosed(dateKey);
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

  formatDate(value: string | Date | undefined) {
    if (!value) return 'No disponible';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return 'No disponible';

    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }
}
