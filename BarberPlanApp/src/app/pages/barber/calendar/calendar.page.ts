import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
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

  constructor(
    private apiService: ApiService,
    private storage: Storage
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
    if (!this.user?.id) {
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
        isClosed: this.isDayClosed(key)
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
  //para las lineas de los limites en las citas en calendario
  private updateScheduleLimits() {
    this.dayOpenTime = null;
    this.dayCloseTime = null;

    if (!this.horarioBarberia || !this.selectedDateKey) return;

    const dateObj = this.parseDateKey(this.selectedDateKey);
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayKey = dayNames[dateObj.getDay()];

    if (this.horarioBarberia.exceptions && Array.isArray(this.horarioBarberia.exceptions)) {
      const exception = this.horarioBarberia.exceptions.find((ex: any) => ex.date === this.selectedDateKey);
      if (exception) {
        if (exception.type === 'closed') {
           return;
        } else if (exception.type === 'custom' && exception.start && exception.end) {
           this.dayOpenTime = exception.start;
           this.dayCloseTime = exception.end;
           return;
        }
      }
    }

    // 2. Regular schedule
    const weeklyTemplate = this.horarioBarberia.weeklyTemplate;
    if (weeklyTemplate && weeklyTemplate[dayKey] && Array.isArray(weeklyTemplate[dayKey])) {
      const slots = weeklyTemplate[dayKey];
      if (slots.length > 0) {
        let minStart = '23:59';
        let maxEnd = '00:00';
        for (const slot of slots) {
          if (slot.start && slot.start < minStart) minStart = slot.start;
          if (slot.end && slot.end > maxEnd) maxEnd = slot.end;
        }
        if (minStart !== '23:59') this.dayOpenTime = minStart;
        if (maxEnd !== '00:00') this.dayCloseTime = maxEnd;
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

  private parseDateKey(dateKey: string) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private toDateKey(dateValue: string | Date) {
    const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
    const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return `${normalizedDate.getFullYear()}-${String(normalizedDate.getMonth() + 1).padStart(2, '0')}-${String(normalizedDate.getDate()).padStart(2, '0')}`;
  }
}
