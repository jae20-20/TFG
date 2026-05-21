import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';
import { ApiService } from '../../../../services/api.service';

type ScheduleDayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

interface ScheduleSlot {
  start: string;
  end: string;
}

interface ScheduleException {
  date: string;
  type: 'closed' | 'custom' | 'block';
  reason: string;
  start?: string;
  end?: string;
}

interface BarberiaSchedule {
  timezone: string;
  weeklyTemplate: Record<ScheduleDayKey, ScheduleSlot[]>;
  exceptions: ScheduleException[];
}

@Component({
  selector: 'app-schedule',
  templateUrl: './schedule.page.html',
  styleUrls: ['./schedule.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class SchedulePage implements OnInit {
  horarioForm: BarberiaSchedule = this.createDefaultHorarioForm();
  newHorarioExceptionForm = {
    date: '',
    type: 'closed' as ScheduleException['type'],
    reason: '',
    start: '',
    end: ''
  };
  horarioError = '';
  savingHorario = false;
  legacyHorario: string | null = null;
  scheduleDays: Array<{ key: ScheduleDayKey; label: string }> = [
    { key: 'mon', label: 'Lunes' },
    { key: 'tue', label: 'Martes' },
    { key: 'wed', label: 'Miércoles' },
    { key: 'thu', label: 'Jueves' },
    { key: 'fri', label: 'Viernes' },
    { key: 'sat', label: 'Sábado' },
    { key: 'sun', label: 'Domingo' }
  ];
  barberia: any = null;
  loading = false;

  constructor(
    private apiService: ApiService,
    private toastCtrl: ToastController
  ) { }

  ngOnInit() {
    this.loadData();
  }

  async loadData() {
    this.loading = true;
    try {
      this.barberia = await this.apiService.getMyBarberia();
      await this.loadHorarioData();
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      this.loading = false;
    }
  }

  private createDefaultHorarioForm(): BarberiaSchedule {
    return {
      timezone: 'Europe/Madrid',
      weeklyTemplate: {
        mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: []
      },
      exceptions: []
    };
  }

  private initializeHorarioForm(scheduleData: Partial<BarberiaSchedule> | null | undefined) {
    const defaultSchedule = this.createDefaultHorarioForm();
    const weeklyTemplate = defaultSchedule.weeklyTemplate;

    if (scheduleData?.weeklyTemplate) {
      (Object.keys(weeklyTemplate) as ScheduleDayKey[]).forEach((dayKey) => {
        const slots = scheduleData.weeklyTemplate?.[dayKey] || [];
        weeklyTemplate[dayKey] = slots.map((slot) => ({
          start: slot.start || '',
          end: slot.end || ''
        }));
      });
    }

    this.horarioForm = {
      timezone: scheduleData?.timezone || defaultSchedule.timezone,
      weeklyTemplate,
      exceptions: Array.isArray(scheduleData?.exceptions)
        ? scheduleData.exceptions.map((exception) => ({
            date: exception.date || '',
            type: exception.type || 'closed',
            reason: exception.reason || '',
            start: exception.start || '',
            end: exception.end || ''
          }))
        : []
    };
  }

  async loadHorarioData() {
    this.horarioError = '';
    try {
      const response = await this.apiService.getMyHorario();
      const horario = response?.horario || response?.schedule || response || null;
      this.legacyHorario = response?.legacyHorario || this.barberia?.horario || null;
      this.initializeHorarioForm(horario);
    } catch (error) {
      console.error('Error al cargar horario:', error);
      this.horarioError = 'No se ha podido cargar el horario de la barbería.';
      this.initializeHorarioForm(null);
      this.legacyHorario = this.barberia?.horario || null;
    }
  }

  addWeeklySlot(dayKey: ScheduleDayKey) {
    this.horarioForm.weeklyTemplate[dayKey].push({ start: '', end: '' });
  }

  removeWeeklySlot(dayKey: ScheduleDayKey, slotIndex: number) {
    this.horarioForm.weeklyTemplate[dayKey] = this.horarioForm.weeklyTemplate[dayKey].filter((_, index) => index !== slotIndex);
  }

  addHorarioException() {
    if (!this.newHorarioExceptionForm.date) {
      this.horarioError = 'La fecha de la excepción es obligatoria.';
      return;
    }

    if (this.newHorarioExceptionForm.type !== 'closed') {
      if (!this.newHorarioExceptionForm.start || !this.newHorarioExceptionForm.end) {
        this.horarioError = 'En horarios especiales o bloques debes indicar hora de inicio y fin.';
        return;
      }
      if (!this.isValidTimeRange(this.newHorarioExceptionForm.start, this.newHorarioExceptionForm.end)) {
        this.horarioError = 'La hora de inicio debe ser anterior a la de fin.';
        return;
      }
    }

    this.horarioForm.exceptions = [
      ...this.horarioForm.exceptions,
      {
        date: this.newHorarioExceptionForm.date,
        type: this.newHorarioExceptionForm.type,
        reason: this.newHorarioExceptionForm.reason,
        start: this.newHorarioExceptionForm.type === 'closed' ? '' : this.newHorarioExceptionForm.start,
        end: this.newHorarioExceptionForm.type === 'closed' ? '' : this.newHorarioExceptionForm.end
      }
    ];

    this.newHorarioExceptionForm = { date: '', type: 'closed', reason: '', start: '', end: '' };
    this.horarioError = '';
  }

  removeHorarioException(exceptionIndex: number) {
    this.horarioForm.exceptions = this.horarioForm.exceptions.filter((_, index) => index !== exceptionIndex);
  }

  async saveHorario() {
    if (!this.barberia?._id) {
      this.horarioError = 'No se encontró la barbería para guardar el horario.';
      return;
    }

    const invalidSlot = this.findInvalidWeeklySlot();
    if (invalidSlot) {
      this.horarioError = invalidSlot;
      return;
    }

    const invalidException = this.findInvalidException();
    if (invalidException) {
      this.horarioError = invalidException;
      return;
    }

    this.savingHorario = true;
    this.horarioError = '';

    try {
      await this.apiService.updateMyHorario({ horario: this.horarioForm });
      await this.loadHorarioData();

      const toast = await this.toastCtrl.create({
        message: 'Horario guardado correctamente',
        duration: 2000,
        position: 'bottom',
        color: 'success'
      });
      await toast.present();
    } catch (error) {
      console.error('Error al guardar horario:', error);
      this.horarioError = 'No se pudo guardar el horario.';

      const toast = await this.toastCtrl.create({
        message: 'Error al guardar horario',
        duration: 2000,
        position: 'bottom',
        color: 'danger'
      });
      await toast.present();
    } finally {
      this.savingHorario = false;
    }
  }

  private findInvalidWeeklySlot() {
    for (const day of this.scheduleDays) {
      for (const slot of this.horarioForm.weeklyTemplate[day.key]) {
        if (!slot.start || !slot.end) return `Completa las horas de apertura en ${day.label}.`;
        if (!this.isValidTimeRange(slot.start, slot.end)) return `La hora de inicio debe ser anterior a la hora de fin en ${day.label}.`;
      }
    }
    return '';
  }

  private findInvalidException() {
    for (const exception of this.horarioForm.exceptions) {
      if (!exception.date) return 'Todas las excepciones deben tener una fecha.';
      if (exception.type !== 'closed') {
        if (!exception.start || !exception.end) return 'Las excepciones de horario o bloqueos requieren hora de inicio y fin.';
        if (!this.isValidTimeRange(exception.start, exception.end)) return 'La hora de inicio de la excepción debe ser anterior a la hora de fin.';
      }
    }
    return '';
  }

  private isValidTimeRange(start: string, end: string) {
    const [startHour, startMinute] = start.split(':').map(Number);
    const [endHour, endMinute] = end.split(':').map(Number);
    const startTotal = (startHour * 60) + startMinute;
    const endTotal = (endHour * 60) + endMinute;
    return Number.isFinite(startTotal) && Number.isFinite(endTotal) && startTotal < endTotal;
  }
}
