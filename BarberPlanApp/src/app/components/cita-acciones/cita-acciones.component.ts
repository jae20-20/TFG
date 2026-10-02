import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkDoneOutline, checkmarkOutline, closeOutline, personRemoveOutline } from 'ionicons/icons';
import { AccionEstadoCita, admiteAsistencia, esPendiente, limiteRespuesta } from '../../services/cita-estado.util';

// Botones para aceptar/rechazar una reserva pendiente o registrar la asistencia de una cita ya empezada
@Component({
  selector: 'app-cita-acciones',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './cita-acciones.component.html',
  styleUrls: ['./cita-acciones.component.scss']
})
export class CitaAccionesComponent {
  @Input() cita: any;
  @Input() mostrarLimite = true;
  @Output() accion = new EventEmitter<AccionEstadoCita>();

  readonly esPendiente = esPendiente;
  readonly admiteAsistencia = admiteAsistencia;
  readonly limiteRespuesta = limiteRespuesta;

  constructor() {
    addIcons({
      'checkmark-outline': checkmarkOutline,
      'close-outline': closeOutline,
      'checkmark-done-outline': checkmarkDoneOutline,
      'person-remove-outline': personRemoveOutline
    });
  }

  emitir(accion: AccionEstadoCita, event: Event) {
    event.stopPropagation();
    this.accion.emit(accion);
  }
}
