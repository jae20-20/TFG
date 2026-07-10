import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController, AlertController } from '@ionic/angular';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../../../services/api.service';

@Component({
  selector: 'app-solicitudes',
  templateUrl: './solicitudes.page.html',
  styleUrls: ['./solicitudes.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class SolicitudesPage implements OnInit {
  solicitudes: any[] = [];
  loading = false;
  error = '';
  
  // Form para nueva solicitud
  showForm = false;
  newSolicitud = {
    tipo: 'dia_libre',
    fechaInicio: '',
    fechaFin: '',
    motivo: '',
    franjas: [{ start: '', end: '' }]
  };
  submitting = false;

  constructor(
    private apiService: ApiService,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private route: ActivatedRoute
  ) { }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['new'] === 'true' || params['new'] === '1') {
        this.showForm = true;
      }
    });
    this.loadSolicitudes();
  }

  async loadSolicitudes() {
    this.loading = true;
    try {
      const response = await this.apiService.getMisSolicitudes();
      this.solicitudes = response?.solicitudes || [];
    } catch (e) {
      console.error('Error al cargar solicitudes', e);
      this.error = 'No se pudieron cargar tus solicitudes.';
    } finally {
      this.loading = false;
    }
  }

  toggleForm() {
    this.showForm = !this.showForm;
    if (!this.showForm) {
      this.resetForm();
    }
  }

  resetForm() {
    this.newSolicitud = {
      tipo: 'dia_libre',
      fechaInicio: '',
      fechaFin: '',
      motivo: '',
      franjas: [{ start: '', end: '' }]
    };
  }

  addFranja() {
    if (!this.newSolicitud.franjas) {
      this.newSolicitud.franjas = [];
    }
    this.newSolicitud.franjas.push({ start: '', end: '' });
  }

  removeFranja(index: number) {
    if (this.newSolicitud.franjas && this.newSolicitud.franjas.length > 1) {
      this.newSolicitud.franjas.splice(index, 1);
    }
  }

  getTipoLabel(tipo: string): string {
    if (tipo === 'dia_libre') return 'Día Libre';
    if (tipo === 'vacaciones') return 'Vacaciones';
    if (tipo === 'horas_puntuales') return 'Horas Puntuales';
    if (tipo === 'bloqueo_servicio') return 'Bloqueo de Servicio';
    return tipo;
  }

  async submitSolicitud() {
    if (this.newSolicitud.tipo === 'dia_libre' || this.newSolicitud.tipo === 'horas_puntuales') {
      this.newSolicitud.fechaFin = this.newSolicitud.fechaInicio;
    }

    if (!this.newSolicitud.fechaInicio || !this.newSolicitud.fechaFin) {
      const toast = await this.toastCtrl.create({
        message: 'Por favor, selecciona las fechas.',
        duration: 2000, position: 'bottom', color: 'warning'
      });
      return toast.present();
    }

    if (this.newSolicitud.fechaInicio > this.newSolicitud.fechaFin) {
      const toast = await this.toastCtrl.create({
        message: 'La fecha de fin debe ser posterior a la de inicio.',
        duration: 2000, position: 'bottom', color: 'warning'
      });
      return toast.present();
    }

    this.submitting = true;
    try {
      await this.apiService.createSolicitud(this.newSolicitud);
      const toast = await this.toastCtrl.create({
        message: 'Solicitud enviada correctamente.',
        duration: 2000, position: 'bottom', color: 'success'
      });
      toast.present();
      
      this.toggleForm();
      await this.loadSolicitudes();
    } catch (e) {
      console.error('Error al enviar solicitud', e);
      const toast = await this.toastCtrl.create({
        message: 'Error al enviar la solicitud.',
        duration: 2000, position: 'bottom', color: 'danger'
      });
      toast.present();
    } finally {
      this.submitting = false;
    }
  }

  async confirmDelete(id: string) {
    const alert = await this.alertCtrl.create({
      header: 'Eliminar solicitud',
      message: '¿Estás seguro de que quieres cancelar esta solicitud?',
      cssClass: 'premium-alert',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Sí, eliminar', role: 'destructive', handler: () => this.deleteSolicitud(id) }
      ]
    });
    await alert.present();
  }

  async deleteSolicitud(id: string) {
    try {
      await this.apiService.deleteSolicitud(id);
      const toast = await this.toastCtrl.create({
        message: 'Solicitud eliminada.',
        duration: 2000, position: 'bottom', color: 'success'
      });
      toast.present();
      await this.loadSolicitudes();
    } catch (e) {
      console.error('Error al eliminar solicitud', e);
      const toast = await this.toastCtrl.create({
        message: 'Error al eliminar la solicitud.',
        duration: 2000, position: 'bottom', color: 'danger'
      });
      toast.present();
    }
  }
}
