import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlertController, IonicModule, ToastController } from '@ionic/angular';
import { ApiService } from '../../../../services/api.service';
import { addIcons } from 'ionicons';
import { banOutline, timeOutline, cashOutline, checkmarkCircleOutline, closeOutline, hourglassOutline, lockOpenOutline } from 'ionicons/icons';

addIcons({
  'ban-outline': banOutline,
  'time-outline': timeOutline,
  'cash-outline': cashOutline,
  'checkmark-circle-outline': checkmarkCircleOutline,
  'close-outline': closeOutline,
  'hourglass-outline': hourglassOutline,
  'lock-open-outline': lockOpenOutline
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
  bloqueosSolicitados = new Set<string>();
  desbloqueando: string | null = null;
  loading = false;
  error = '';

  // Modal solicitud bloqueo
  isModalOpen = false;
  selectedService: any = null;
  bloqueoMotivo = '';
  submitting = false;

  constructor(
    private apiService: ApiService,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController
  ) { }

  ngOnInit() {
    this.loadData();
  }

  async loadData() {
    this.loading = true;
    this.error = '';
    try {
      const [barberia, myProfile, misSolicitudes] = await Promise.all([
        this.apiService.getMyBarberia(),
        this.apiService.getMyProfile(),
        this.apiService.getMisSolicitudes().catch(() => null)
      ]);

      if (barberia && barberia._id) {
        this.servicios = await this.apiService.getServiciosBarberia(barberia._id);
      } else {
        this.servicios = barberia?.servicios || [];
      }

      this.serviciosBloqueados = myProfile?.serviciosBloqueados || [];
      this.bloqueosSolicitados = new Set(
        (misSolicitudes?.solicitudes || [])
          .filter((s: any) => s.tipo === 'bloqueo_servicio' && s.estado === 'pendiente' && s.servicioId)
          .map((s: any) => s.servicioId.toString())
      );
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

  tieneBloqueoSolicitado(servicio: any): boolean {
    return this.bloqueosSolicitados.has((servicio?._id || servicio?.id || '').toString());
  }

  async confirmarDesbloqueo(servicio: any) {
    const alert = await this.alertCtrl.create({
      header: 'Desbloquear servicio',
      message: `¿Quieres volver a ofrecer ${servicio.nombre}? Los clientes podrán reservarlo contigo desde ahora.`,
      cssClass: 'premium-alert',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Desbloquear', role: 'confirm' }
      ]
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role === 'confirm') {
      await this.desbloquear(servicio);
    }
  }

  private async desbloquear(servicio: any) {
    const id = (servicio._id || servicio.id).toString();
    this.desbloqueando = id;
    try {
      const respuesta = await this.apiService.desbloquearMiServicio(id);
      this.serviciosBloqueados = respuesta?.serviciosBloqueados || this.serviciosBloqueados.filter((b: any) => b?.toString() !== id);
      await this.mostrarToast(`${servicio.nombre} vuelve a estar disponible.`, 'success');
    } catch (e: any) {
      console.error('Error al desbloquear el servicio:', e);
      await this.mostrarToast(e?.error?.error || 'No se pudo desbloquear el servicio.', 'danger');
      if (e?.status === 409) {
        await this.loadData();
      }
    } finally {
      this.desbloqueando = null;
    }
  }

  private async mostrarToast(message: string, color: 'success' | 'danger') {
    const toast = await this.toastCtrl.create({ message, duration: 2500, position: 'bottom', color });
    await toast.present();
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

      this.bloqueosSolicitados.add(this.selectedService._id.toString());
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
