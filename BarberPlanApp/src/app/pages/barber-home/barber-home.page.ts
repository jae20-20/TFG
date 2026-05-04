import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AlertController, IonicModule, ToastController } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

interface CalendarDay {
  date: Date;
  key: string;
  dayNumber: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  hasAppointments: boolean;
  appointmentCount: number;
}

@Component({
  selector: 'app-barber-home',
  templateUrl: './barber-home.page.html',
  styleUrls: ['./barber-home.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class BarberHomePage implements OnInit {
  user: any = null;
  activeSection: 'calendario' | 'configuracion' | 'perfil-barbero' = 'calendario';
  barberoEditForm: any = null;
  isEditingBarbero = false;
  savingBarbero = false;
  barberoProfileError = '';
  citas: any[] = [];
  loadingCitas = false;
  calendarError = '';
  calendarDays: CalendarDay[] = [];
  currentMonthDate = new Date();
  calendarMonthLabel = '';
  selectedDateKey = this.toDateKey(new Date());
  selectedDateLabel = '';
  selectedDayAppointments: any[] = [];

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private storage: Storage,
    private router: Router,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController
  ) { }

  async ngOnInit() {
    await this.storage.create();
    this.user = await this.storage.get('user');
    this.initializeBarberoEditForm();
    this.currentMonthDate = new Date();
    this.selectedDateKey = this.toDateKey(new Date());
    this.buildCalendar(this.currentMonthDate);
    await this.loadBarberoProfile();
    await this.loadBarberiaCitas();
  }

  setSection(section: 'calendario' | 'configuracion' | 'perfil-barbero') {
    this.activeSection = section;
  }

  private initializeBarberoEditForm() {
    if (!this.user) {
      this.barberoEditForm = {
        nombre: '',
        apellido: '',
        usuario: '',
        telefono: '',
        correo: ''
      };
      return;
    }

    this.barberoEditForm = {
      nombre: this.user.nombre || '',
      apellido: this.user.apellido || '',
      usuario: this.user.usuario || '',
      telefono: this.user.telefono || '',
      correo: this.user.correo || ''
    };
  }

  async loadBarberoProfile() {
    try {
      const profile = await this.apiService.getMyProfile();
      this.user = { ...this.user, ...profile };
      await this.storage.set('user', this.user);
      this.initializeBarberoEditForm();
    } catch (error) {
      console.error('Error al cargar perfil de barbero:', error);
      this.initializeBarberoEditForm();
    }
  }

  enterBarberoEditMode() {
    this.isEditingBarbero = true;
    this.barberoProfileError = '';
  }

  cancelBarberoEdit() {
    this.isEditingBarbero = false;
    this.barberoProfileError = '';
    this.initializeBarberoEditForm();
  }

  async saveBarberoProfile() {
    if (!this.barberoEditForm?.nombre || !this.barberoEditForm?.apellido || !this.barberoEditForm?.usuario) {
      this.barberoProfileError = 'Nombre, apellidos y usuario son obligatorios.';
      return;
    }

    this.savingBarbero = true;
    this.barberoProfileError = '';

    try {
      const response = await this.apiService.updateMyProfile({
        nombre: this.barberoEditForm.nombre,
        apellido: this.barberoEditForm.apellido,
        usuario: this.barberoEditForm.usuario,
        telefono: this.barberoEditForm.telefono
      });

      const updatedUser = response?.user || this.barberoEditForm;
      this.user = { ...this.user, ...updatedUser };
      await this.storage.set('user', this.user);

      this.initializeBarberoEditForm();
      this.isEditingBarbero = false;

      const toast = await this.toastCtrl.create({
        message: 'Perfil actualizado correctamente',
        duration: 2000,
        position: 'bottom',
        color: 'success'
      });
      await toast.present();
    } catch (error) {
      console.error('Error al guardar perfil de barbero:', error);
      this.barberoProfileError = 'No se ha podido guardar el perfil.';

      const toast = await this.toastCtrl.create({
        message: 'Error al guardar perfil',
        duration: 2000,
        position: 'bottom',
        color: 'danger'
      });
      await toast.present();
    } finally {
      this.savingBarbero = false;
    }
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
        appointmentCount: appointments.length
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
    this.buildCalendar(this.currentMonthDate);
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

  private parseDateKey(dateKey: string) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private toDateKey(dateValue: string | Date) {
    const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
    const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return `${normalizedDate.getFullYear()}-${String(normalizedDate.getMonth() + 1).padStart(2, '0')}-${String(normalizedDate.getDate()).padStart(2, '0')}`;
  }

  async logout() {
    const alert = await this.alertCtrl.create({
      header: 'Cerrar Sesión',
      message: '¿Estás seguro de que quieres cerrar sesión?',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Cerrar Sesión',
          handler: async () => {
            await this.authService.logout();
            await this.storage.remove('user');
            this.router.navigateByUrl('/login', { replaceUrl: true });
          }
        }
      ]
    });

    await alert.present();
  }

}
