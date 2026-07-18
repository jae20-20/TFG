import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ToastController } from '@ionic/angular';
import { ApiService } from '../../../../services/api.service';

@Component({
  selector: 'app-team-requests',
  templateUrl: './team-requests.page.html',
  styleUrls: ['./team-requests.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class TeamRequestsPage implements OnInit {
  solicitudes: any[] = [];
  loading = false;
  error = '';

  constructor(
    private apiService: ApiService,
    private toastCtrl: ToastController
  ) { }

  ngOnInit() {
    this.loadSolicitudes();
  }

  async loadSolicitudes() {
    this.loading = true;
    try {
      const response = await this.apiService.getSolicitudesEquipo();
      this.solicitudes = response?.solicitudes || [];
    } catch (e) {
      console.error('Error al cargar solicitudes', e);
      this.error = 'No se pudieron cargar las solicitudes del equipo.';
    } finally {
      this.loading = false;
    }
  }

  async responderSolicitud(solicitudId: string, estado: string) {
    try {
      await this.apiService.responderSolicitud(solicitudId, estado, 'Respondido por el administrador');
      
      const toast = await this.toastCtrl.create({
        message: 'Solicitud actualizada correctamente.',
        duration: 2000,
        position: 'bottom',
        color: 'success'
      });
      await toast.present();
      
      await this.loadSolicitudes();
    } catch (e) {
      console.error('Error al responder solicitud', e);
      const toast = await this.toastCtrl.create({
        message: 'Error al actualizar la solicitud.',
        duration: 2000,
        position: 'bottom',
        color: 'danger'
      });
      await toast.present();
    }
  }

  getTipoLabel(tipo: string): string {
    if (tipo === 'dia_libre') return 'Día Libre';
    if (tipo === 'vacaciones') return 'Vacaciones';
    if (tipo === 'horas_puntuales') return 'Horas Puntuales';
    if (tipo === 'bloqueo_servicio') return 'Bloqueo de Servicio';
    return tipo;
  }

  getInitials(fullName: string): string {
    if (!fullName) return 'BA';
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase() || 'BA';
  }
}
