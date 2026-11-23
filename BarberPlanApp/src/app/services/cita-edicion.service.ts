import { Injectable } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { ApiService } from './api.service';
import { EdicionCita } from './cita-estado.util';
import { toHHMM, toMinutes } from './schedule.util';

const CAMPOS_EDITADOS = ['fecha', 'horaInicio', 'horaFin', 'barberoId', 'servicios', 'servicioId', 'servicioNombre',
  'servicioPrecio', 'servicioDuracion', 'importePagado'] as const;

type CitaAgenda = Record<string, unknown> & { _id: string; fecha: string; horaInicio: string; horaFin?: string };

const diaMes = (fecha: string) => `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;

@Injectable({ providedIn: 'root' })
export class CitaEdicionService {
  constructor(private api: ApiService, private toastCtrl: ToastController) {}

  aplicar(cita: CitaAgenda, actualizada: Record<string, unknown>) {
    const cambios = Object.fromEntries(CAMPOS_EDITADOS.filter((campo) => actualizada[campo] !== undefined).map((campo) => [campo, actualizada[campo]]));
    Object.assign(cita, cambios);
  }

  // Actualización optimista: la cita se mueve al momento y vuelve a su sitio si el servidor la rechaza
  async mover(cita: CitaAgenda, fecha: string, horaInicio: string, refrescar: () => void): Promise<boolean> {
    const anterior = { fecha: cita.fecha, horaInicio: cita.horaInicio, horaFin: cita.horaFin };
    const fechaActual = String(cita.fecha).slice(0, 10);
    const cambios: EdicionCita = {};
    if (fecha !== fechaActual) cambios.fecha = fecha;
    if (horaInicio !== cita.horaInicio) cambios.horaInicio = horaInicio;
    if (!cambios.fecha && !cambios.horaInicio) return false;

    const duracion = cita.horaFin ? toMinutes(cita.horaFin) - toMinutes(cita.horaInicio) : Number(cita['servicioDuracion']) || 30;
    Object.assign(cita, { fecha, horaInicio, horaFin: toHHMM(toMinutes(horaInicio) + duracion) });
    refrescar();

    try {
      const respuesta = await this.api.editarCita(cita._id, cambios);
      this.aplicar(cita, respuesta.cita);
      refrescar();
      await this.toast(`Cita movida al ${diaMes(fecha)} a las ${horaInicio}.`, 'success');
      return true;
    } catch (e: unknown) {
      Object.assign(cita, anterior);
      refrescar();
      const cuerpo = (e as { error?: { error?: unknown } })?.error;
      const motivo = typeof cuerpo?.error === 'string' ? cuerpo.error : 'No se pudo mover la cita.';
      await this.toast(`${motivo} La cita vuelve a su hora.`, 'danger');
      return false;
    }
  }

  async toast(message: string, color: 'success' | 'danger' | 'medium') {
    const toast = await this.toastCtrl.create({ message, duration: color === 'danger' ? 3500 : 2000, color });
    await toast.present();
  }
}
