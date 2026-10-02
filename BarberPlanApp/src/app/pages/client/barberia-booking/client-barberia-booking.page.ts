import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule, ToastController, AlertController } from '@ionic/angular';
import { ApiService } from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';
import { Storage } from '@ionic/storage-angular';
import { ThemeHeaderBtnComponent } from '../../../components/theme-header-btn/theme-header-btn.component';
import { addIcons } from 'ionicons';
import { logOutOutline, arrowBackOutline, businessOutline, hourglassOutline } from 'ionicons/icons';

interface ReservaForm {
  servicioId: string;
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
  imports: [IonicModule, CommonModule, FormsModule, ThemeHeaderBtnComponent]
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
  reservaPaso: 1 | 2 | 3 = 1;

  horariosDisponibles: string[] = [];
  minFecha = new Date().toISOString().split('T')[0];

  reservaForm: ReservaForm = {
    servicioId: '',
    barberoId: '',
    fecha: this.minFecha,
    horaInicio: '',
    comentario: ''
  };

  readonly comentarioMaxLength = 300;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private apiService: ApiService,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private authService: AuthService,
    private storage: Storage
  ) {
    addIcons({ logOutOutline, arrowBackOutline, businessOutline, hourglassOutline });
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
      await this.loadDisponibilidad();
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

  getServicioNombre() {
    return this.servicios.find((servicio) => this.getEntityId(servicio) === this.reservaForm.servicioId)?.nombre || 'Servicio';
  }

  getBarberoSeleccionado() {
    return this.barberos.find((barbero) => this.getEntityId(barbero) === this.reservaForm.barberoId) || null;
  }

  getDuracionSeleccionada() {
    const servicio = this.servicios.find((item) => this.getEntityId(item) === this.reservaForm.servicioId);
    const duracion = Number(servicio?.duracion);
    return Number.isFinite(duracion) && duracion > 0 ? `${duracion} min` : 'Duración no disponible';
  }

  getStepLabel(step: 1 | 2 | 3) {
    if (step === 1) return 'Servicio';
    if (step === 2) return 'Barbero';
    return 'Fecha y hora';
  }

  goToPrevStep() {
    if (this.reservaPaso > 1) {
      this.reservaPaso = (this.reservaPaso - 1) as 1 | 2 | 3;
    }
  }

  getBarberosDisponibles() {
    if (!this.reservaForm.servicioId) return this.barberos;
    return this.barberos.filter(b => {
      const bloqueados = b?.serviciosBloqueados || [];
      return !bloqueados.includes(this.reservaForm.servicioId);
    });
  }

  selectServicio(servicioId: string) {
    this.reservaForm.servicioId = servicioId;
    this.reservaPaso = 2;
  }

  selectBarbero(barberoId: string) {
    this.reservaForm.barberoId = barberoId;
    this.reservaForm.horaInicio = '';
    // void this.loadDisponibilidad(); - will load when moving to next step
  }

  selectFecha(fecha: string) {
    this.reservaForm.fecha = fecha;
    this.reservaForm.horaInicio = '';
    void this.loadDisponibilidad(true);
  }

  async goToNextStep() {
    if (this.reservaPaso === 2) {
      if (!this.reservaForm.barberoId || !this.reservaForm.fecha) {
        return;
      }
      await this.loadDisponibilidad(true);
      if (this.horariosDisponibles.length === 0) {
        return; // stay on step 2 if closed or fully booked
      }
    }
    
    if (this.reservaPaso < 3) {
      this.reservaPaso = (this.reservaPaso + 1) as 1 | 2 | 3;
    }
  }

  async loadDisponibilidad(showWarnings: boolean = false) {
    if (!this.reservaForm.barberoId || !this.reservaForm.fecha || !this.barberiaId) {
      this.horariosDisponibles = [];
      return;
    }

    this.loadingDisponibilidad = true;

    try {
      const response = await this.apiService.getDisponibilidadBarbero(
        this.reservaForm.barberoId,
        this.reservaForm.fecha,
        this.barberiaId
      );

      this.horariosDisponibles = Array.isArray(response?.horariosDisponibles)
        ? response.horariosDisponibles
        : [];

      if (response?.estado === 'cerrado') {
        if (showWarnings) {
          const alert = await this.alertCtrl.create({
            header: 'Día Cerrado',
            message: 'La barbería no abre en la fecha seleccionada. Por favor, elige otro día.',
            cssClass: 'premium-alert',
            buttons: ['Aceptar']
          });
          await alert.present();
        }
      } else if (response?.estado === 'ausente') {
        if (showWarnings) {
          const alert = await this.alertCtrl.create({
            header: 'Barbero Ausente',
            message: 'El barbero seleccionado no tiene disponibilidad en esta fecha. Por favor, elige otro profesional u otro día.',
            cssClass: 'premium-alert',
            buttons: ['Aceptar']
          });
          await alert.present();
        }
      } else if (response?.estado === 'completo') {
        if (showWarnings) {
          const toast = await this.toastCtrl.create({
            message: 'No hay citas disponibles para este día.',
            duration: 3000,
            position: 'bottom',
            color: 'warning'
          });
          await toast.present();
        }
      }
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
    if (!this.reservaForm.servicioId || !this.reservaForm.barberoId || !this.reservaForm.fecha || !this.reservaForm.horaInicio) {
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
        servicioId: this.reservaForm.servicioId,
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