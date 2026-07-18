import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, IonicModule, ToastController } from '@ionic/angular';
import { ApiService } from '../../../../../services/api.service';

type ScheduleDayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

interface ScheduleSlot {
  start: string;
  end: string;
}

interface BarberDetail {
  _id: string;
  nombre: string;
  apellido: string;
  telefono: string;
  correo: string;
  avatar?: string;
  diasLibres?: string[];
  vacaciones?: { fechaInicio: string; fechaFin: string; motivo: string }[];
  horarioPersonal?: {
    enabled: boolean;
    timezone: string;
    weeklyTemplate: Record<ScheduleDayKey, ScheduleSlot[]>;
  };
}

@Component({
  selector: 'app-barber-details',
  templateUrl: './barber-details.page.html',
  styleUrls: ['./barber-details.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class BarberDetailsPage implements OnInit {
  barberId: string | null = null;
  barber: BarberDetail | null = null;
  loading = false;
  error = '';
  saving = false;

  scheduleDays: Array<{ key: ScheduleDayKey; label: string }> = [
    { key: 'mon', label: 'Lunes' },
    { key: 'tue', label: 'Martes' },
    { key: 'wed', label: 'Miércoles' },
    { key: 'thu', label: 'Jueves' },
    { key: 'fri', label: 'Viernes' },
    { key: 'sat', label: 'Sábado' },
    { key: 'sun', label: 'Domingo' }
  ];

  newDiaLibre = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private apiService: ApiService,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController
  ) {}

  ngOnInit() {
    this.barberId = this.route.snapshot.paramMap.get('id');
    if (this.barberId) {
      this.loadBarberDetail();
    } else {
      this.error = 'ID de barbero no disponible.';
    }
  }

  async loadBarberDetail() {
    this.loading = true;
    try {
      this.barber = await this.apiService.getBarberoById(this.barberId!);
      if (!this.barber!.horarioPersonal) {
        this.barber!.horarioPersonal = {
          enabled: false,
          timezone: 'Europe/Madrid',
          weeklyTemplate: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }
        };
      }
      if (!this.barber!.diasLibres) this.barber!.diasLibres = [];
      if (!this.barber!.vacaciones) this.barber!.vacaciones = [];
    } catch (e) {
      console.error('Error cargando detalle de barbero', e);
      this.error = 'No se pudo cargar la información del barbero.';
    } finally {
      this.loading = false;
    }
  }

  toggleHorarioEspecial(event: any) {
    if (this.barber && this.barber.horarioPersonal) {
      this.barber.horarioPersonal.enabled = event.detail.checked;
    }
  }

  addWeeklySlot(dayKey: ScheduleDayKey) {
    if (this.barber?.horarioPersonal) {
      this.barber.horarioPersonal.weeklyTemplate[dayKey].push({ start: '', end: '' });
    }
  }

  removeWeeklySlot(dayKey: ScheduleDayKey, slotIndex: number) {
    if (this.barber?.horarioPersonal) {
      this.barber.horarioPersonal.weeklyTemplate[dayKey] = this.barber.horarioPersonal.weeklyTemplate[dayKey].filter((_, index) => index !== slotIndex);
    }
  }

  addDiaLibre() {
    if (this.newDiaLibre && this.barber) {
      if (!this.barber.diasLibres!.includes(this.newDiaLibre)) {
        this.barber.diasLibres!.push(this.newDiaLibre);
      }
      this.newDiaLibre = '';
    }
  }

  removeDiaLibre(index: number) {
    if (this.barber) {
      this.barber.diasLibres!.splice(index, 1);
    }
  }

  async saveChanges() {
    if (!this.barber) return;
    this.saving = true;
    try {
      const payload = {
        horarioPersonal: this.barber.horarioPersonal,
        diasLibres: this.barber.diasLibres,
        vacaciones: this.barber.vacaciones
      };
      await this.apiService.updateBarbero(this.barber._id, payload);
      
      const toast = await this.toastCtrl.create({
        message: 'Cambios guardados correctamente.',
        duration: 2000, position: 'bottom', color: 'success'
      });
      await toast.present();
    } catch (e) {
      console.error('Error guardando cambios', e);
      const toast = await this.toastCtrl.create({
        message: 'Error al guardar los cambios.',
        duration: 2000, position: 'bottom', color: 'danger'
      });
      await toast.present();
    } finally {
      this.saving = false;
    }
  }

  async confirmRemoveBarber() {
    const alert = await this.alertCtrl.create({
      header: 'Confirmar eliminación',
      message: `¿Estás seguro de que deseas eliminar a ${this.barber?.nombre} ${this.barber?.apellido} de la barbería?`,
      cssClass: 'premium-alert',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive', handler: () => { this.removeBarber(); } }
      ]
    });
    await alert.present();
  }

  async removeBarber() {
    if (!this.barber) return;
    this.saving = true;
    try {
      const miBarberia = await this.apiService.getMyBarberia();
      await this.apiService.removeBarbero(miBarberia._id, this.barber._id);
      const toast = await this.toastCtrl.create({
        message: 'Barbero eliminado de la barbería con éxito.',
        duration: 2000, position: 'bottom', color: 'success'
      });
      await toast.present();
      this.router.navigate(['/admin/configuration'], { replaceUrl: true });
    } catch (e) {
      console.error('Error eliminando barbero', e);
      const toast = await this.toastCtrl.create({
        message: 'Error al eliminar al barbero.',
        duration: 2000, position: 'bottom', color: 'danger'
      });
      await toast.present();
    } finally {
      this.saving = false;
    }
  }

  getInitials(barber: any): string {
    if (!barber) return 'BA';
    const nombre = (barber.nombre || '').trim();
    const apellido = (barber.apellido || '').trim();
    const initials = `${nombre.charAt(0)}${apellido.charAt(0)}`.trim();
    return initials || 'BA';
  }
}
