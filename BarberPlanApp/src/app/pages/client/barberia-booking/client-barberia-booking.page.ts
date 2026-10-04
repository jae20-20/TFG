import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule, ToastController, AlertController } from '@ionic/angular';
import { ApiService } from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';
import { Storage } from '@ionic/storage-angular';
import { ThemeHeaderBtnComponent } from '../../../components/theme-header-btn/theme-header-btn.component';
import { FechaDisponibleComponent } from '../../../components/fecha-disponible/fecha-disponible.component';
import { addIcons } from 'ionicons';
import { logOutOutline, arrowBackOutline, businessOutline, hourglassOutline, checkmarkCircle, addCircleOutline } from 'ionicons/icons';

// Mismos límites que aplica el servidor
const MAX_SERVICIOS_CITA = 4;
const MAX_MESES_ADELANTE = 12;
// Si el mes actual no tiene huecos, se buscan en los siguientes antes de dar el mes por vacío
const MESES_A_EXPLORAR = 3;

type PasoReserva = 1 | 2 | 3 | 4;

const claveMes = (fecha: Date) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;

const sumarMeses = (mes: string, n: number) => {
  const [anio, numero] = mes.split('-').map(Number);
  return claveMes(new Date(anio, numero - 1 + n, 1));
};

interface ReservaForm {
  servicioIds: string[];
  barberoId: string;
  fecha: string;
  horaInicio: string;
  comentario: string;
}

@Component({
  selector: 'app-client-barberia-booking',
  templateUrl: './client-barberia-booking.page.html',
  styleUrls: ['./client-barberia-booking.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, ThemeHeaderBtnComponent, FechaDisponibleComponent]
})
export class ClientBarberiaBookingPage implements OnInit {
  barberiaId = '';
  barberia: any = null;
  servicios: any[] = [];
  barberos: any[] = [];

  loading = false;
  loadingDisponibilidad = false;
  reservando = false;
  error = '';
  reservaPaso: PasoReserva = 1;

  horariosDisponibles: string[] = [];

  // Calendario del paso 3: solo los días con hueco para este barbero y esta duración
  readonly minMes = claveMes(new Date());
  readonly maxMes = sumarMeses(claveMes(new Date()), MAX_MESES_ADELANTE);
  mesVisible = claveMes(new Date());
  diasDisponibles: string[] = [];
  loadingDias = false;
  private cargaDias = 0;

  reservaForm: ReservaForm = {
    servicioIds: [],
    barberoId: '',
    fecha: '',
    horaInicio: '',
    comentario: ''
  };

  readonly comentarioMaxLength = 300;
  readonly maxServicios = MAX_SERVICIOS_CITA;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private apiService: ApiService,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private authService: AuthService,
    private storage: Storage
  ) {
    addIcons({ logOutOutline, arrowBackOutline, businessOutline, hourglassOutline, checkmarkCircle, addCircleOutline });
  }

  async ngOnInit() {
    this.barberiaId = this.route.snapshot.paramMap.get('id') || '';

    if (!this.barberiaId) {
      this.error = 'No se ha encontrado la barbería.';
      return;
    }

    await this.loadBarberiaDetail();
  }

  async loadBarberiaDetail() {
    this.loading = true;
    this.error = '';

    try {
      const [barberia, servicios, barberos] = await Promise.all([
        this.apiService.getBarberia(this.barberiaId),
        this.apiService.getServiciosBarberia(this.barberiaId),
        this.apiService.getBarberosBarberia(this.barberiaId)
      ]);

      this.barberia = barberia;
      this.servicios = Array.isArray(servicios) ? servicios : [];
      this.barberos = Array.isArray(barberos) ? barberos : [];

      this.reservaPaso = 1;
    } catch (error) {
      console.error('Error al cargar detalle de barbería:', error);
      this.error = 'No se pudo cargar el proceso de reserva.';
    } finally {
      this.loading = false;
    }
  }

  getEntityId(entity: any): string {
    return entity?._id || entity?.id || '';
  }

  getCoverImage() {
    return this.barberia?.portadaUrl || this.barberia?.imagen || '';
  }

  getLogoImage() {
    return this.barberia?.logoUrl || '';
  }

  requiereAprobacion() {
    return this.barberia?.modoConfirmacion === 'manual';
  }

  getBarberoNombre(barbero: any) {
    return [barbero?.nombre, barbero?.apellido].filter(Boolean).join(' ') || barbero?.usuario || 'Barbero';
  }

  getBarberoInitials(barbero: any): string {
    if (!barbero) return 'BA';
    const nombre = (barbero.nombre || '').trim();
    const apellido = (barbero.apellido || '').trim();
    const initials = `${nombre.charAt(0)}${apellido.charAt(0)}`.trim();
    return initials || 'BA';
  }

  getServicioPrecio(servicio: any) {
    const precio = Number(servicio?.precio);
    if (!Number.isFinite(precio)) {
      return '-';
    }

    return `${precio.toFixed(2)} EUR`;
  }

  // Servicios elegidos en el orden en que se marcaron (el primero es el principal)
  getServiciosSeleccionados() {
    return this.reservaForm.servicioIds
      .map((id) => this.servicios.find((servicio) => this.getEntityId(servicio) === id))
      .filter(Boolean);
  }

  getServicioNombre() {
    return this.getServiciosSeleccionados().map((s: any) => s.nombre).join(' + ') || 'Servicio';
  }

  getDuracionTotal() {
    return this.getServiciosSeleccionados().reduce((total: number, s: any) => total + (Number(s.duracion) || 0), 0);
  }

  getPrecioTotal() {
    return this.getServiciosSeleccionados().reduce((total: number, s: any) => total + (Number(s.precio) || 0), 0);
  }

  getOrdenServicio(servicio: any) {
    return this.reservaForm.servicioIds.indexOf(this.getEntityId(servicio)) + 1;
  }

  getBarberoSeleccionado() {
    return this.barberos.find((barbero) => this.getEntityId(barbero) === this.reservaForm.barberoId) || null;
  }

  getDuracionSeleccionada() {
    const duracion = this.getDuracionTotal();
    return duracion > 0 ? `${duracion} min · ${this.getPrecioTotal().toFixed(2)} €` : 'Duración no disponible';
  }

  getFechaLabel() {
    if (!this.reservaForm.fecha) return '';
    const [anio, mes, dia] = this.reservaForm.fecha.split('-').map(Number);
    const texto = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(anio, mes - 1, dia));
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  goToPrevStep() {
    if (this.reservaPaso > 1) {
      this.reservaPaso = (this.reservaPaso - 1) as PasoReserva;
    }
  }

  // Si cambian los servicios, el barbero o la duración, los días y la hora elegidos dejan de ser válidos
  private reiniciarFecha() {
    this.cargaDias++;
    this.reservaForm.fecha = '';
    this.reservaForm.horaInicio = '';
    this.horariosDisponibles = [];
    this.diasDisponibles = [];
    this.mesVisible = this.minMes;
  }

  // Solo los barberos que realizan todos los servicios elegidos
  getBarberosDisponibles() {
    return this.barberos.filter(b => {
      const bloqueados = b?.serviciosBloqueados || [];
      return !this.reservaForm.servicioIds.some((id) => bloqueados.includes(id));
    });
  }

  async toggleServicio(servicioId: string) {
    const ids = this.reservaForm.servicioIds;
    if (ids.includes(servicioId)) {
      this.reservaForm.servicioIds = ids.filter((id) => id !== servicioId);
      return;
    }
    if (ids.length >= MAX_SERVICIOS_CITA) {
      const toast = await this.toastCtrl.create({
        message: `Puedes elegir como máximo ${MAX_SERVICIOS_CITA} servicios por cita.`,
        duration: 2200,
        position: 'bottom',
        color: 'warning'
      });
      await toast.present();
      return;
    }
    this.reservaForm.servicioIds = [...ids, servicioId];
  }

  // Al cambiar los servicios, el barbero elegido puede dejar de valer y la hora deja de ser segura
  confirmarServicios() {
    if (this.reservaForm.servicioIds.length === 0) return;
    if (!this.getBarberosDisponibles().some((b) => this.getEntityId(b) === this.reservaForm.barberoId)) {
      this.reservaForm.barberoId = '';
    }
    this.reiniciarFecha();
    this.reservaPaso = 2;
  }

  selectBarbero(barberoId: string) {
    if (this.reservaForm.barberoId !== barberoId) {
      this.reservaForm.barberoId = barberoId;
      this.reiniciarFecha();
    }
  }

  async goToNextStep() {
    if (this.reservaPaso === 2) {
      if (!this.reservaForm.barberoId) return;
      this.reservaPaso = 3;
      if (this.diasDisponibles.length === 0) {
        await this.cargarPrimerMesConHuecos();
      }
    }
  }

  // Carga los días libres del mes y, si no hay ninguno, prueba con los siguientes
  private async cargarPrimerMesConHuecos() {
    const carga = ++this.cargaDias;
    this.loadingDias = true;
    let mes = this.minMes;
    try {
      for (let intento = 0; intento < MESES_A_EXPLORAR && mes <= this.maxMes; intento++) {
        const dias = await this.pedirDias(mes);
        if (carga !== this.cargaDias) return;
        this.mesVisible = mes;
        this.diasDisponibles = dias;
        if (dias.length > 0) return;
        mes = sumarMeses(mes, 1);
      }
      this.mesVisible = this.minMes;
    } catch (error) {
      await this.avisarErrorDias(error, carga);
    } finally {
      if (carga === this.cargaDias) this.loadingDias = false;
    }
  }

  async cambiarMesVisible(mes: string) {
    const carga = ++this.cargaDias;
    this.loadingDias = true;
    try {
      const dias = await this.pedirDias(mes);
      if (carga !== this.cargaDias) return;
      this.mesVisible = mes;
      this.diasDisponibles = dias;
    } catch (error) {
      await this.avisarErrorDias(error, carga);
    } finally {
      if (carga === this.cargaDias) this.loadingDias = false;
    }
  }

  private async pedirDias(mes: string) {
    const respuesta = await this.apiService.getDiasDisponibles(
      this.reservaForm.barberoId,
      mes,
      this.barberiaId,
      this.getDuracionTotal() || undefined
    );
    return Array.isArray(respuesta?.dias) ? respuesta.dias : [];
  }

  private async avisarErrorDias(error: unknown, carga: number) {
    if (carga !== this.cargaDias) return;
    console.error('Error al cargar los días disponibles:', error);
    this.diasDisponibles = [];
    const toast = await this.toastCtrl.create({
      message: 'No se pudo cargar la disponibilidad del barbero.',
      duration: 2200,
      position: 'bottom',
      color: 'danger'
    });
    await toast.present();
  }

  async selectFecha(fecha: string) {
    this.reservaForm.fecha = fecha;
    this.reservaForm.horaInicio = '';
    await this.loadDisponibilidad();
    if (this.horariosDisponibles.length === 0) {
      // Otra reserva se llevó los últimos huecos mientras se elegía el día
      const toast = await this.toastCtrl.create({
        message: 'Ese día se acaba de llenar. Elige otro.',
        duration: 2500,
        position: 'bottom',
        color: 'warning'
      });
      await toast.present();
      this.reservaForm.fecha = '';
      await this.cambiarMesVisible(this.mesVisible);
      return;
    }
    this.reservaPaso = 4;
  }

  async loadDisponibilidad() {
    if (!this.reservaForm.barberoId || !this.reservaForm.fecha || !this.barberiaId) {
      this.horariosDisponibles = [];
      return;
    }

    this.loadingDisponibilidad = true;

    try {
      const response = await this.apiService.getDisponibilidadBarbero(
        this.reservaForm.barberoId,
        this.reservaForm.fecha,
        this.barberiaId,
        false,
        this.getDuracionTotal() || undefined
      );

      this.horariosDisponibles = Array.isArray(response?.horariosDisponibles)
        ? response.horariosDisponibles
        : [];
    } catch (error) {
      console.error('Error al cargar disponibilidad:', error);
      this.horariosDisponibles = [];
      const toast = await this.toastCtrl.create({
        message: 'No se pudo cargar la disponibilidad del barbero.',
        duration: 2200,
        position: 'bottom',
        color: 'danger'
      });
      await toast.present();
    } finally {
      this.loadingDisponibilidad = false;
    }
  }

  selectHorario(hora: string) {
    this.reservaForm.horaInicio = hora;
  }

  async reservarCita() {
    if (this.reservaForm.servicioIds.length === 0 || !this.reservaForm.barberoId || !this.reservaForm.fecha || !this.reservaForm.horaInicio) {
      const toast = await this.toastCtrl.create({
        message: 'Completa servicio, barbero, fecha y hora para reservar.',
        duration: 2200,
        position: 'bottom',
        color: 'warning'
      });
      await toast.present();
      return;
    }

    this.reservando = true;

    try {
      const respuesta = await this.apiService.crearCita({
        barberiaId: this.barberiaId,
        barberoId: this.reservaForm.barberoId,
        servicioIds: this.reservaForm.servicioIds,
        fecha: this.reservaForm.fecha,
        horaInicio: this.reservaForm.horaInicio,
        comentario: this.reservaForm.comentario.trim()
      });

      const pendiente = respuesta?.cita?.estado === 'pendiente';
      const toast = await this.toastCtrl.create({
        message: pendiente
          ? 'Solicitud enviada. Verás la respuesta de la barbería en Mis citas.'
          : 'Cita reservada correctamente.',
        duration: pendiente ? 3200 : 2200,
        position: 'bottom',
        color: 'success'
      });
      await toast.present();

      this.router.navigateByUrl(pendiente ? '/client-appointments' : '/client-home', { replaceUrl: true });
    } catch (error: any) {
      console.error('Error al crear cita:', error);
      const message = error?.error?.error || 'No se pudo reservar la cita.';
      const toast = await this.toastCtrl.create({
        message,
        duration: 2400,
        position: 'bottom',
        color: 'danger'
      });
      await toast.present();
    } finally {
      this.reservando = false;
    }
  }

  goBack() {
    if (this.barberiaId) {
      this.router.navigate(['/client-home/barberia', this.barberiaId]);
      return;
    }

    this.router.navigateByUrl('/client-home');
  }

  async logout() {
    const alert = await this.alertCtrl.create({
      header: 'Cerrar Sesión',
      message: '¿Estás seguro de que quieres cerrar sesión?',
      cssClass: 'premium-alert',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
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