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
  selector: 'app-admin-home',
  templateUrl: './admin-home.page.html',
  styleUrls: ['./admin-home.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class AdminHomePage implements OnInit {
  user: any = null;
  barberia: any = null;
  barberiaEditForm: any = null;
  newServicioForm: any = {
    nombre: '',
    precio: '',
    duracion: ''
  };
  isEditingPerfil = false;
  savingPerfil = false;
  savingServicio = false;
  deletingServicioId: string | null = null;
  activeSection: 'calendario' | 'configuracion' = 'calendario';
  citas: any[] = [];
  loadingCitas = false;
  loadingBarberia = false;
  calendarError = '';
  barberiaError = '';
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
  ) {}

  async ngOnInit() {
    await this.storage.create();
    this.user = await this.storage.get('user');
    this.currentMonthDate = new Date();
    this.selectedDateKey = this.toDateKey(new Date());
    this.buildCalendar(this.currentMonthDate);
    await this.loadBarberiaData();
    await this.loadBarberiaCitas();
  }

  setSection(section: 'calendario' | 'configuracion') {
    this.activeSection = section;
  }

  async loadBarberiaCitas() {
    if (!this.user?.barberiaId) {
      this.calendarError = 'No se ha encontrado la barbería asociada.';
      this.citas = [];
      this.updateSelectedDayAppointments();
      return;
    }

    this.loadingCitas = true;
    this.calendarError = '';

    try {
      const citas = await this.apiService.getCitasBarberia(this.user.barberiaId);
      this.citas = Array.isArray(citas) ? citas : [];
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

  async loadBarberiaData() {
    this.loadingBarberia = true;
    this.barberiaError = '';

    try {
      this.barberia = await this.apiService.getMyBarberia();
      this.initializeEditForm();
    } catch (error) {
      console.error('Error al cargar la barbería:', error);
      this.barberiaError = 'No se han podido cargar los datos de la barbería.';
      this.barberia = null;
    } finally {
      this.loadingBarberia = false;
      this.resetServicioForm();
    }
  }

  private initializeEditForm() {
    if (this.barberia) {
      this.barberiaEditForm = {
        nombre: this.barberia.nombre,
        direccion: this.barberia.direccion,
        telefono: this.barberia.telefono,
        descripcion: this.barberia.descripcion,
        horario: this.barberia.horario
      };
    }
  }

  enterEditMode() {
    this.isEditingPerfil = true;
  }

  cancelEdit() {
    this.isEditingPerfil = false;
    this.initializeEditForm();
  }

  private resetServicioForm() {
    this.newServicioForm = {
      nombre: '',
      precio: '',
      duracion: ''
    };
  }

  async addServicio() {
    if (!this.barberia || !this.barberia._id) {
      this.barberiaError = 'No se encontró la barbería para añadir el servicio.';
      return;
    }

    if (!this.newServicioForm.nombre || !this.newServicioForm.precio || !this.newServicioForm.duracion) {
      this.barberiaError = 'Nombre, precio y duración son obligatorios.';
      return;
    }

    this.savingServicio = true;
    this.barberiaError = '';

    try {
      await this.apiService.addServicio(this.barberia._id, {
        nombre: this.newServicioForm.nombre,
        precio: this.newServicioForm.precio,
        duracion: this.newServicioForm.duracion
      });

      await this.loadBarberiaData();

      const toast = await this.toastCtrl.create({
        message: 'Servicio añadido correctamente',
        duration: 2000,
        position: 'bottom',
        color: 'success'
      });
      await toast.present();
    } catch (error) {
      console.error('Error al añadir el servicio:', error);
      this.barberiaError = 'No se ha podido añadir el servicio.';

      const toast = await this.toastCtrl.create({
        message: 'Error al añadir el servicio',
        duration: 2000,
        position: 'bottom',
        color: 'danger'
      });
      await toast.present();
    } finally {
      this.savingServicio = false;
    }
  }

  async confirmDeleteServicio(servicio: any) {
    if (!servicio?._id) {
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Eliminar servicio',
      message: `¿Quieres eliminar el servicio "${servicio.nombre}"?`,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: async () => {
            await this.deleteServicio(servicio._id);
          }
        }
      ]
    });

    await alert.present();
  }

  private async deleteServicio(servicioId: string) {
    if (!this.barberia || !this.barberia._id) {
      this.barberiaError = 'No se encontró la barbería para eliminar el servicio.';
      return;
    }

    this.deletingServicioId = servicioId;
    this.barberiaError = '';

    try {
      await this.apiService.deleteServicio(this.barberia._id, servicioId);
      await this.loadBarberiaData();

      const toast = await this.toastCtrl.create({
        message: 'Servicio eliminado correctamente',
        duration: 2000,
        position: 'bottom',
        color: 'success'
      });
      await toast.present();
    } catch (error) {
      console.error('Error al eliminar el servicio:', error);
      this.barberiaError = 'No se ha podido eliminar el servicio.';

      const toast = await this.toastCtrl.create({
        message: 'Error al eliminar el servicio',
        duration: 2000,
        position: 'bottom',
        color: 'danger'
      });
      await toast.present();
    } finally {
      this.deletingServicioId = null;
    }
  }

  async savePerfil() {
    if (!this.barberia || !this.barberia._id) {
      this.barberiaError = 'Error: No se encontró el ID de la barbería.';
      return;
    }

    if (!this.barberiaEditForm.nombre || !this.barberiaEditForm.direccion) {
      this.barberiaError = 'El nombre y la dirección son requeridos.';
      return;
    }

    this.savingPerfil = true;
    this.barberiaError = '';

    try {
      // Guardar cambios en el servidor
      await this.apiService.updateBarberia(
        this.barberia._id,
        this.barberiaEditForm
      );
      
      // Recargar datos desde el servidor para asegurar sincronización
      await this.loadBarberiaData();
      
      // Salir del modo edición
      this.isEditingPerfil = false;
      
      // Mostrar mensaje de éxito
      const toast = await this.toastCtrl.create({
        message: 'Barbería actualizada correctamente',
        duration: 2000,
        position: 'bottom',
        color: 'success'
      });
      await toast.present();
    } catch (error) {
      console.error('Error al guardar la barbería:', error);
      this.barberiaError = 'No se han podido guardar los cambios de la barbería.';
      
      // Mostrar mensaje de error
      const toast = await this.toastCtrl.create({
        message: 'Error al guardar los cambios',
        duration: 2000,
        position: 'bottom',
        color: 'danger'
      });
      await toast.present();
    } finally {
      this.savingPerfil = false;
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

  formatDate(value: string | Date | undefined) {
    if (!value) {
      return 'No disponible';
    }

    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) {
      return 'No disponible';
    }

    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  get adminFullName() {
    if (!this.user) {
      return 'No disponible';
    }

    return [this.user.nombre, this.user.apellido].filter(Boolean).join(' ') || 'No disponible';
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
