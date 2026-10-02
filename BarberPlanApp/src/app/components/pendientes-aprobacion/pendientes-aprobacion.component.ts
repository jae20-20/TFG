import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronDownOutline, chevronUpOutline, hourglassOutline } from 'ionicons/icons';
import { CitaAccionesComponent } from '../cita-acciones/cita-acciones.component';
import { AccionEstadoCita, inicioCita, limiteRespuesta } from '../../services/cita-estado.util';

// Aviso con las reservas que esperan respuesta del admin o del barbero
@Component({
  selector: 'app-pendientes-aprobacion',
  standalone: true,
  imports: [CommonModule, IonicModule, CitaAccionesComponent],
  templateUrl: './pendientes-aprobacion.component.html',
  styleUrls: ['./pendientes-aprobacion.component.scss']
})
export class PendientesAprobacionComponent implements OnChanges {
  @Input() citas: any[] = [];
  @Input() mostrarBarbero = false;
  @Output() accion = new EventEmitter<{ cita: any; accion: AccionEstadoCita }>();
  @Output() verCita = new EventEmitter<any>();

  abierto = true;
  ordenadas: any[] = [];

  readonly limiteRespuesta = limiteRespuesta;

  constructor() {
    addIcons({
      'hourglass-outline': hourglassOutline,
      'chevron-up-outline': chevronUpOutline,
      'chevron-down-outline': chevronDownOutline
    });
  }

  ngOnChanges() {
    this.ordenadas = [...this.citas].sort((a, b) =>
      `${a.fecha}${a.horaInicio}`.localeCompare(`${b.fecha}${b.horaInicio}`));
  }

  fechaCorta(cita: any): string {
    const inicio = inicioCita(cita);
    if (!inicio) return cita?.fecha || '';
    const texto = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).format(inicio);
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  nombreCliente(cita: any): string {
    return `${cita?.cliente?.nombre || cita?.clienteNombre || 'Cliente'} ${cita?.cliente?.apellido || ''}`.trim();
  }

  nombreBarbero(cita: any): string {
    return [cita?.barbero?.nombre, cita?.barbero?.apellido].filter(Boolean).join(' ');
  }
}
