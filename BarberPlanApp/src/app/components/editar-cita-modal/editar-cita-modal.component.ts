import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ApiService } from '../../services/api.service';
import { EdicionCita } from '../../services/cita-estado.util';

export interface CitaEditable {
  _id: string;
  fecha: string;
  horaInicio: string;
  horaFin?: string;
  barberoId?: string;
  barbero?: { _id?: string };
  servicioId?: string;
  servicioDuracion?: number;
  servicios?: { _id: string; nombre?: string; duracion?: number }[];
}

export interface BarberoOpcion {
  _id: string;
  displayName: string;
  activo?: boolean;
  serviciosBloqueados?: string[];
}

interface ServicioOpcion {
  _id: string;
  nombre: string;
  duracion: number;
  precio: number;
}

const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

@Component({
  selector: 'app-editar-cita-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  templateUrl: './editar-cita-modal.component.html',
  styleUrls: ['./editar-cita-modal.component.scss']
})
export class EditarCitaModalComponent implements OnChanges {
  @Input() abierto = false;
  @Input() cita: CitaEditable | null = null;
  @Input() barberiaId = '';
  @Input() puedeCambiarBarbero = false;
  @Input() barberos: BarberoOpcion[] = [];

  @Output() guardada = new EventEmitter<Record<string, unknown>>();
  @Output() cerrar = new EventEmitter<void>();

  readonly fechaMinima = hoyLocal();

  fecha = '';
  horaInicio = '';
  barberoId = '';
  servicioIds: string[] = [];

  servicios: ServicioOpcion[] = [];
  huecos: string[] = [];
  cargandoHuecos = false;
  guardando = false;
  error = '';

  private barberoOriginal = '';
  private serviciosOriginales: string[] = [];
  private peticionHuecos = 0;

  constructor(private api: ApiService) {}

  ngOnChanges(changes: SimpleChanges) {
    if ((changes['abierto'] || changes['cita']) && this.abierto && this.cita) {
      this.iniciar(this.cita);
    }
  }

  get fechaActualTexto(): string {
    if (!this.cita?.fecha) return '';
    const [y, m, d] = String(this.cita.fecha).slice(0, 10).split('-').map(Number);
    return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d));
  }

  get barberosDisponibles(): BarberoOpcion[] {
    // Un barbero desactivado solo se ofrece si ya es el de la cita
    return this.barberos.filter((b) => b.activo !== false || b._id === this.barberoOriginal);
  }

  get duracion(): number {
    if (!this.serviciosCambiados()) {
      return Number(this.cita?.servicioDuracion) || this.sumar('duracion');
    }
    return this.sumar('duracion');
  }

  get precio(): number {
    return this.sumar('precio');
  }

  get servicioNoRealizado(): string | null {
    if (this.barberoId === this.barberoOriginal && !this.serviciosCambiados()) return null;
    const barbero = this.barberos.find((b) => b._id === this.barberoId);
    const bloqueado = this.servicios.find((s) => this.servicioIds.includes(s._id) && barbero?.serviciosBloqueados?.includes(s._id));
    return bloqueado ? `Este barbero no realiza el servicio ${bloqueado.nombre}` : null;
  }

  get hayCambios(): boolean {
    return !!this.cita && (
      this.fecha !== String(this.cita.fecha).slice(0, 10)
      || this.horaInicio !== this.cita.horaInicio
      || this.barberoId !== this.barberoOriginal
      || this.serviciosCambiados()
    );
  }

  get puedeGuardar(): boolean {
    return this.hayCambios && !!this.horaInicio && this.servicioIds.length > 0 && !this.servicioNoRealizado && !this.guardando;
  }

  async onFechaChange() {
    await this.cargarHuecos();
  }

  async onBarberoChange() {
    await this.cargarHuecos();
  }

  async onServiciosChange() {
    await this.cargarHuecos();
  }

  elegirHora(hora: string) {
    this.horaInicio = hora;
    this.error = '';
  }

  async guardar() {
    if (!this.cita || !this.puedeGuardar) return;
    const cambios: EdicionCita = {};
    if (this.fecha !== String(this.cita.fecha).slice(0, 10)) cambios.fecha = this.fecha;
    if (this.horaInicio !== this.cita.horaInicio) cambios.horaInicio = this.horaInicio;
    if (this.barberoId !== this.barberoOriginal) cambios.barberoId = this.barberoId;
    if (this.serviciosCambiados()) cambios.servicioIds = [...this.servicioIds];

    this.guardando = true;
    this.error = '';
    try {
      const respuesta = await this.api.editarCita(this.cita._id, cambios);
      this.guardada.emit(respuesta.cita);
    } catch (e: unknown) {
      this.error = this.mensajeError(e, 'No se pudo guardar la cita.');
      await this.cargarHuecos();
    } finally {
      this.guardando = false;
    }
  }

  onCerrar() {
    this.cerrar.emit();
  }

  private async iniciar(cita: CitaEditable) {
    this.fecha = String(cita.fecha).slice(0, 10);
    this.horaInicio = cita.horaInicio;
    this.barberoOriginal = String(cita.barberoId ?? cita.barbero?._id ?? '');
    this.barberoId = this.barberoOriginal;
    this.serviciosOriginales = cita.servicios?.length
      ? cita.servicios.map((s) => String(s._id))
      : (cita.servicioId ? [String(cita.servicioId)] : []);
    this.servicioIds = [...this.serviciosOriginales];
    this.error = '';
    this.huecos = [];

    try {
      const servicios = await this.api.getServiciosBarberia(this.barberiaId);
      this.servicios = (Array.isArray(servicios) ? servicios : []).map((s: ServicioOpcion) => ({
        _id: String(s._id), nombre: s.nombre, duracion: Number(s.duracion) || 0, precio: Number(s.precio) || 0
      }));
    } catch {
      this.servicios = [];
      this.error = 'No se han podido cargar los servicios.';
    }
    await this.cargarHuecos();
  }

  private async cargarHuecos() {
    if (!this.cita || !this.fecha) return;
    // Solo cuenta la respuesta de la última petición
    const peticion = ++this.peticionHuecos;
    this.cargandoHuecos = true;
    try {
      const res = await this.api.getHuecosEdicion(this.cita._id, this.fecha, {
        barberoId: this.barberoId !== this.barberoOriginal ? this.barberoId : undefined,
        duracion: this.duracion || undefined
      });
      if (peticion !== this.peticionHuecos) return;
      this.huecos = res?.horariosDisponibles || [];
      if (!this.huecos.includes(this.horaInicio)) this.horaInicio = '';
    } catch (e: unknown) {
      if (peticion !== this.peticionHuecos) return;
      this.huecos = [];
      this.horaInicio = '';
      this.error = this.mensajeError(e, 'No se ha podido consultar la disponibilidad.');
    } finally {
      if (peticion === this.peticionHuecos) this.cargandoHuecos = false;
    }
  }

  // ion-select devuelve los elegidos en el orden de las opciones, así que el orden no cuenta como cambio
  private serviciosCambiados(): boolean {
    return this.servicioIds.length !== this.serviciosOriginales.length
      || this.servicioIds.some((id) => !this.serviciosOriginales.includes(id));
  }

  private sumar(campo: 'duracion' | 'precio'): number {
    return this.servicios
      .filter((s) => this.servicioIds.includes(s._id))
      .reduce((total, s) => total + s[campo], 0);
  }

  private mensajeError(e: unknown, porDefecto: string): string {
    const cuerpo = (e as { error?: { error?: unknown } })?.error;
    return typeof cuerpo?.error === 'string' ? cuerpo.error : porDefecto;
  }
}
