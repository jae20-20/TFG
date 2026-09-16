import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { AlertController, IonicModule } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { ApiService } from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';
import { ThemeHeaderBtnComponent } from '../../../components/theme-header-btn/theme-header-btn.component';

import { addIcons } from 'ionicons';
import { homeOutline, calendarOutline, personOutline, cutOutline, timeOutline, logOutOutline } from 'ionicons/icons';

type FiltroCitas = 'proximas' | 'anteriores' | 'todas';

@Component({
  selector: 'app-client-appointments',
  templateUrl: './client-appointments.page.html',
  styleUrls: ['./client-appointments.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, ThemeHeaderBtnComponent]
})
export class ClientAppointmentsPage implements OnInit {
  user: any = null;
  citas: any[] = [];
  loadingCitas = false;
  citasError = '';
  currentTab: 'inicio' | 'citas' | 'perfil' = 'citas';
  filtroCitas: FiltroCitas = 'proximas';

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private storage: Storage,
    private router: Router,
    private alertCtrl: AlertController,
    private cdr: ChangeDetectorRef
  ) {
    addIcons({
      'home-outline': homeOutline,
      'calendar-outline': calendarOutline,
      'person-outline': personOutline,
      'cut-outline': cutOutline,
      'time-outline': timeOutline,
      'log-out-outline': logOutOutline
    });

    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        if (this.router.url.startsWith('/client-appointments')) {
          this.currentTab = 'citas';
          this.cdr.detectChanges();
        }
      }
    });
  }

  ionViewWillEnter() {
    this.currentTab = 'citas';
    this.cdr.detectChanges();
    this.loadMisCitas();
  }

  async ngOnInit() {
    await this.storage.create();
    this.user = await this.storage.get('user');
    this.currentTab = 'citas';
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

  get citasFiltradas() {
    const ahora = new Date();

    const citas = this.citas.filter((cita) => {
      if (this.filtroCitas === 'todas') {
        return true;
      }

      const fechaHora = this.getCitaDateTime(cita);
      const esFutura = fechaHora === null || fechaHora.getTime() >= ahora.getTime();
      return this.filtroCitas === 'proximas' ? esFutura : !esFutura;
    });

    citas.sort((a, b) => {
      const fechaA = this.getCitaDateTime(a)?.getTime() ?? 0;
      const fechaB = this.getCitaDateTime(b)?.getTime() ?? 0;
      return this.filtroCitas === 'proximas' ? fechaA - fechaB : fechaB - fechaA;
    });

    return citas;
  }

  seleccionarFiltro(filtro: FiltroCitas) {
    this.filtroCitas = filtro;
  }

  private getCitaDateTime(cita: any): Date | null {
    if (!cita?.fecha) {
      return null;
    }

    const hora = cita?.horaInicio || cita?.horaFin || '00:00';
    const fechaHora = new Date(`${cita.fecha}T${hora}`);
    return Number.isNaN(fechaHora.getTime()) ? null : fechaHora;
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
      cssClass: 'premium-alert',
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