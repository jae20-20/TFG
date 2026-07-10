import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';
import { ApiService } from '../../../../services/api.service';
import { addIcons } from 'ionicons';
import { banOutline, timeOutline, cashOutline, checkmarkCircleOutline, closeOutline } from 'ionicons/icons';

addIcons({
  'ban-outline': banOutline,
  'time-outline': timeOutline,
  'cash-outline': cashOutline,
  'checkmark-circle-outline': checkmarkCircleOutline,
  'close-outline': closeOutline
});

@Component({
  selector: 'app-catalogo-servicios',
  templateUrl: './catalogo-servicios.page.html',
  styleUrls: ['./catalogo-servicios.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class CatalogoServiciosPage implements OnInit {
  servicios: any[] = [];
  serviciosBloqueados: any[] = [];
  loading = false;
  error = '';

  // Modal solicitud bloqueo
  isModalOpen = false;
  selectedService: any = null;
  bloqueoMotivo = '';
  submitting = false;

  constructor(
    private apiService: ApiService,
    private toastCtrl: ToastController
  ) { }

  ngOnInit() {
    this.loadData();
  }

  async loadData() {
    this.loading = true;
    this.error = '';
    try {
      const [barberia, myProfile] = await Promise.all([
        this.apiService.getMyBarberia(),
        this.apiService.getMyProfile()
      ]);

      if (barberia && barberia._id) {
        this.servicios = await this.apiService.getServiciosBarberia(barberia._id);
      } else {
        this.servicios = barberia?.servicios || [];
      }

      this.serviciosBloqueados = myProfile?.serviciosBloqueados || [];
    } catch (e) {
      console.error('Error al cargar servicios del barbero:', e);
      this.error = 'No se han podido cargar los servicios de la barbería.';
    } finally {
      this.loading = false;
    }
  }

  isBlocked(servicio: any): boolean {
    if (!servicio) return false;
    const id = (servicio._id || servicio.id || '').toString();
    if (!id) return false;
    return this.serviciosBloqueados.some((b: any) => {
      const bloqId = (typeof b === 'object' && b ? (b._id || b.id) : b || '').toString();
      return bloqId === id;
    });
  }

  openBloqueoModal(servicio: any) {
    this.selectedService = servicio;
    this.bloqueoMotivo = `Solicito no realizar el servicio: ${servicio.nombre}`;
    this.isModalOpen = true;
  }

  closeModal() {
    this.isModalOpen = false;
    this.selectedService = null;
    this.bloqueoMotivo = '';
  }

  async sendBloqueoSolicitud() {
    if (!this.selectedService) return;

    this.submitting = true;
    try {
      const today = new Date().toISOString().split('T')[0];
      await this.apiService.createSolicitud({
        tipo: 'bloqueo_servicio',
        fechaInicio: today,
        fechaFin: today,
        motivo: this.bloqueoMotivo || `Solicitud de bloqueo del servicio: ${this.selectedService.nombre}`,
        servicioId: this.selectedService._id,
        servicioNombre: this.selectedService.nombre
      });

      const toast = await this.toastCtrl.create({
        message: 'Solicitud de bloqueo enviada al administrador.',
        duration: 2500,
        position: 'bottom',
        color: 'success'
      });
      await toast.present();

      this.closeModal();
    } catch (e) {
      console.error('Error al solicitar bloqueo del servicio:', e);
      const toast = await this.toastCtrl.create({
        message: 'Error al enviar la solicitud de bloqueo.',
        duration: 2500,
        position: 'bottom',
        color: 'danger'
      });
      await toast.present();
    } finally {
      this.submitting = false;
    }
  }
}
