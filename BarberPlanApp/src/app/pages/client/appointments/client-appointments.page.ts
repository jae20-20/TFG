import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, IonicModule } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { ApiService } from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-client-appointments',
  templateUrl: './client-appointments.page.html',
  styleUrls: ['./client-appointments.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class ClientAppointmentsPage implements OnInit {
  user: any = null;
  citas: any[] = [];
  loadingCitas = false;
  citasError = '';
  currentTab: 'inicio' | 'citas' | 'perfil' = 'citas';

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private storage: Storage,
    private router: Router,
    private alertCtrl: AlertController
  ) {}

  async ngOnInit() {
    await this.storage.create();
    this.user = await this.storage.get('user');
    this.currentTab = this.router.url.startsWith('/client-profile')
      ? 'perfil'
      : this.router.url.startsWith('/client-home')
        ? 'inicio'
        : 'citas';
    await this.loadMisCitas();
  }

  async loadMisCitas() {
    this.loadingCitas = true;
    this.citasError = '';

    try {
      const response = await this.apiService.getMisCitas();
      this.citas = Array.isArray(response) ? response : [];
    } catch (error) {
      console.error('Error al cargar mis citas:', error);
      this.citasError = 'No se han podido cargar tus citas.';
      this.citas = [];
    } finally {
      this.loadingCitas = false;
    }
  }

  getCitaTitle(cita: any) {
    return cita?.barberiaNombre || cita?.barberia?.nombre || cita?.barberia?.name || 'Barbería';
  }

  getCitaService(cita: any) {
    return cita?.servicioNombre || cita?.servicio?.nombre || cita?.servicio || 'Servicio';
  }

  getCitaDateLabel(cita: any) {
    if (!cita?.fecha) {
      return 'Fecha pendiente';
    }

    const date = new Date(cita.fecha);
    if (Number.isNaN(date.getTime())) {
      return cita.fecha;
    }

    return date.toLocaleDateString('es-ES', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  getStatusLabel(cita: any) {
    return (cita?.estado || 'pendiente').toString();
  }

  getStatusClass(cita: any) {
    const status = this.getStatusLabel(cita).toLowerCase();
    return {
      pendiente: status.includes('pend'),
      confirmada: status.includes('conf'),
      completada: status.includes('comp'),
      cancelada: status.includes('cancel')
    };
  }

  isActiveTab(tab: 'inicio' | 'citas' | 'perfil') {
    return this.currentTab === tab;
  }

  goToTab(tab: 'inicio' | 'citas' | 'perfil') {
    this.currentTab = tab;

    if (tab === 'inicio') {
      this.router.navigateByUrl('/client-home');
      return;
    }

    if (tab === 'citas') {
      this.router.navigateByUrl('/client-appointments');
      return;
    }

    this.router.navigateByUrl('/client-profile');
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