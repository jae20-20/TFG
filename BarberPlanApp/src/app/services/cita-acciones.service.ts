import { Injectable } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';
import { ApiService } from './api.service';
import { AccionEstadoCita } from './cita-estado.util';

interface ConfigAccion {
  exito: string;
  confirmacion?: (cita: any) => { header: string; message: string; boton: string };
}

const nombreCliente = (cita: any) =>
  `${cita?.cliente?.nombre || cita?.clienteNombre || 'el cliente'} ${cita?.cliente?.apellido || ''}`.trim();

const ACCIONES: Record<AccionEstadoCita, ConfigAccion> = {
  confirmar: { exito: 'Reserva aceptada.' },
  rechazar: {
    exito: 'Reserva rechazada.',
    confirmacion: (cita) => ({
      header: 'Rechazar reserva',
      message: `¿Rechazar la reserva de ${nombreCliente(cita)} a las ${cita.horaInicio}? El hueco quedará libre.`,
      boton: 'Sí, rechazar'
    })
  },
  completar: { exito: 'Cita marcada como completada.' },
  'no-presentada': {
    exito: 'Cita marcada como no presentada.',
    confirmacion: (cita) => ({
      header: 'Cliente no presentado',
      message: `¿Confirmas que ${nombreCliente(cita)} no se presentó a la cita de las ${cita.horaInicio}?`,
      boton: 'Sí, no vino'
    })
  }
};

// Acciones de estado que comparten los calendarios del admin y del barbero
@Injectable({ providedIn: 'root' })
export class CitaAccionesService {
  constructor(
    private apiService: ApiService,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController
  ) {}

  // Devuelve true si la cita cambió (o si otra persona la cambió antes) y conviene recargar
  async ejecutar(cita: any, accion: AccionEstadoCita): Promise<boolean> {
    const config = ACCIONES[accion];
    if (config.confirmacion && !(await this.confirmar(config.confirmacion(cita)))) {
      return false;
    }

    try {
      await this.apiService.cambiarEstadoCita(cita._id || cita.id, accion);
      await this.mostrarToast(config.exito, 'success');
      return true;
    } catch (error: any) {
      await this.mostrarToast(error?.error?.error || 'No se pudo actualizar la cita.', 'danger');
      return error?.status === 409;
    }
  }

  private async confirmar({ header, message, boton }: { header: string; message: string; boton: string }) {
    const alert = await this.alertCtrl.create({
      header,
      message,
      cssClass: 'premium-alert',
      buttons: [
        { text: 'Volver', role: 'cancel' },
        { text: boton, role: 'destructive' }
      ]
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'destructive';
  }

  private async mostrarToast(message: string, color: 'success' | 'danger') {
    const toast = await this.toastCtrl.create({ message, duration: 2200, color });
    await toast.present();
  }
}
