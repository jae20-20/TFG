import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, NavigationEnd } from '@angular/router';
import { NavController, AlertController, ToastController, IonicModule } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { ApiService } from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';
import { ThemeHeaderBtnComponent } from '../../../components/theme-header-btn/theme-header-btn.component';
import { StarRatingComponent } from '../../../components/star-rating/star-rating.component';
import { ReviewImageComponent } from '../../../components/review-image/review-image.component';
import { ReviewReplyComponent } from '../../../components/review-reply/review-reply.component';

import { addIcons } from 'ionicons';
import { homeOutline, calendarOutline, personOutline, cutOutline, timeOutline, logOutOutline, closeOutline, starOutline, imageOutline, trashOutline, chatbubbleEllipsesOutline, hourglassOutline, informationCircleOutline } from 'ionicons/icons';
import { esCitaProxima, esPendiente, etiquetaEstadoCita, limiteRespuesta } from '../../../services/cita-estado.util';
import { comprimirImagen } from '../../../services/imagen.util';

type FiltroCitas = 'proximas' | 'anteriores' | 'canceladas' | 'todas';
const FILTROS_CITAS: FiltroCitas[] = ['proximas', 'anteriores', 'canceladas', 'todas'];

interface ResenaForm {
  valoracion: number;
  comentario: string;
  imagen: string | null;
}

@Component({
  selector: 'app-client-appointments',
  templateUrl: './client-appointments.page.html',
  styleUrls: ['./client-appointments.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, ThemeHeaderBtnComponent, StarRatingComponent, ReviewImageComponent, ReviewReplyComponent]
})
export class ClientAppointmentsPage implements OnInit {
  // Al cerrar sesión, navigateRoot destruye las pantallas abiertas: la siguiente sesión empieza sin el estado de la anterior
  private navCtrl = inject(NavController);
  user: any = null;
  citas: any[] = [];
  loadingCitas = false;
  citasError = '';
  currentTab: 'inicio' | 'citas' | 'perfil' = 'citas';
  filtroCitas: FiltroCitas = 'proximas';

  isResenaModalOpen = false;
  citaResena: any = null;
  resenaForm: ResenaForm = { valoracion: 0, comentario: '', imagen: null };
  enviandoResena = false;
  procesandoImagenResena = false;
  errorImagenResena = '';

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private storage: Storage,
    private router: Router,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private cdr: ChangeDetectorRef
  ) {
    addIcons({
      'home-outline': homeOutline,
      'calendar-outline': calendarOutline,
      'person-outline': personOutline,
      'cut-outline': cutOutline,
      'time-outline': timeOutline,
      'log-out-outline': logOutOutline,
      'close-outline': closeOutline,
      'star-outline': starOutline,
      'image-outline': imageOutline,
      'trash-outline': trashOutline,
      'chatbubble-ellipses-outline': chatbubbleEllipsesOutline,
      'hourglass-outline': hourglassOutline,
      'information-circle-outline': informationCircleOutline
    });

    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        if (this.router.url.startsWith('/client-appointments')) {
          this.currentTab = 'citas';
          this.cdr.detectChanges();
        }
      }
    });
  }

  ionViewWillEnter() {
    // El aviso del panel Explorar llega con ?filtro=proximas; la página se reutiliza, así que se lee en cada entrada
    const filtro = this.router.parseUrl(this.router.url).queryParams['filtro'];
    if (FILTROS_CITAS.includes(filtro)) {
      this.filtroCitas = filtro;
    }
    this.currentTab = 'citas';
    this.cdr.detectChanges();
    this.loadMisCitas();
  }

  async ngOnInit() {
    await this.storage.create();
    this.user = await this.storage.get('user');
    this.currentTab = 'citas';
    await this.loadMisCitas();
  }

  async loadMisCitas() {
    this.loadingCitas = true;
    this.citasError = '';

    try {
      const response = await this.apiService.getMisCitas();
      this.citas = Array.isArray(response) ? response : [];
    } catch (error) {
      console.error('Error al cargar mis citas:', error);
      this.citasError = 'No se han podido cargar tus citas.';
      this.citas = [];
    } finally {
      this.loadingCitas = false;
    }
  }

  get citasFiltradas() {
    const ahora = new Date();

    const citas = this.citas.filter((cita) => {
      const cancelada = this.estaCancelada(cita);

      if (this.filtroCitas === 'canceladas') {
        return cancelada;
      }
      if (this.filtroCitas === 'todas') {
        return true;
      }
      if (cancelada) {
        return false;
      }

      const esFutura = esCitaProxima(cita, ahora);
      return this.filtroCitas === 'proximas' ? esFutura : !esFutura;
    });

    citas.sort((a, b) => {
      const fechaA = this.getCitaDateTime(a)?.getTime() ?? 0;
      const fechaB = this.getCitaDateTime(b)?.getTime() ?? 0;
      return this.filtroCitas === 'proximas' ? fechaA - fechaB : fechaB - fechaA;
    });

    return citas;
  }

  seleccionarFiltro(filtro: FiltroCitas) {
    this.filtroCitas = filtro;
  }

  getFiltroEmptyLabel(): string {
    switch (this.filtroCitas) {
      case 'proximas': return 'próximas';
      case 'canceladas': return 'canceladas';
      case 'todas': return '';
      default: return 'anteriores';
    }
  }

  private getCitaDateTime(cita: any): Date | null {
    if (!cita?.fecha) {
      return null;
    }

    const hora = cita?.horaInicio || cita?.horaFin || '00:00';
    const fechaHora = new Date(`${cita.fecha}T${hora}`);
    return Number.isNaN(fechaHora.getTime()) ? null : fechaHora;
  }

  getCitaTitle(cita: any) {
    return cita?.barberiaNombre || cita?.barberia?.nombre || cita?.barberia?.name || 'Barbería';
  }

  getCitaService(cita: any) {
    return cita?.servicioNombre || cita?.servicio?.nombre || cita?.servicio || 'Servicio';
  }

  getCitaDateLabel(cita: any) {
    if (!cita?.fecha) {
      return 'Fecha pendiente';
    }

    const date = new Date(cita.fecha);
    if (Number.isNaN(date.getTime())) {
      return cita.fecha;
    }

    return date.toLocaleDateString('es-ES', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  estaCancelada(cita: any) {
    return cita?.estado === 'cancelada';
  }

  readonly etiquetaEstado = etiquetaEstadoCita;
  readonly esPendiente = esPendiente;
  readonly limiteRespuesta = limiteRespuesta;

  // Explicación para el cliente de por qué la cita acabó así
  notaCancelacion(cita: any): string | null {
    if (cita?.estado === 'no_presentada') return 'La barbería registró que no acudiste a esta cita.';
    if (!this.estaCancelada(cita)) return null;
    switch (cita.motivoCancelacion) {
      case 'rechazada': return 'La barbería no ha podido aceptar esta reserva.';
      case 'expirada': return 'La barbería no respondió a tiempo y la reserva se canceló.';
      case 'barberia': return 'La barbería canceló esta cita.';
      default: return null;
    }
  }

  puedeCancelar(cita: any) {
    if (cita?.estado !== 'pendiente' && cita?.estado !== 'confirmada') {
      return false;
    }
    const fechaHora = this.getCitaDateTime(cita);
    return fechaHora !== null && fechaHora.getTime() > Date.now();
  }

  puedeResenar(cita: any) {
    return cita?.estado === 'completada' && !cita?.resena;
  }

  async confirmarCancelarCita(cita: any) {
    const alert = await this.alertCtrl.create({
      header: 'Cancelar Cita',
      message: this.esPendiente(cita)
        ? `¿Quieres retirar tu solicitud de reserva del ${this.getCitaDateLabel(cita)} a las ${cita?.horaInicio || ''}?`
        : `¿Estás seguro de que deseas cancelar tu cita del ${this.getCitaDateLabel(cita)} a las ${cita?.horaInicio || ''}?`,
      cssClass: 'premium-alert',
      buttons: [
        { text: 'Volver', role: 'cancel' },
        {
          text: 'Sí, Cancelar',
          role: 'destructive',
          handler: async () => {
            try {
              await this.apiService.cancelarCita(cita._id || cita.id);
              const toast = await this.toastCtrl.create({ message: 'Cita cancelada correctamente.', duration: 2000, color: 'success' });
              toast.present();
              await this.loadMisCitas();
            } catch (error) {
              console.error('Error al cancelar cita:', error);
              const toast = await this.toastCtrl.create({ message: 'No se pudo cancelar la cita.', duration: 2000, color: 'danger' });
              toast.present();
            }
          }
        }
      ]
    });

    await alert.present();
  }

  abrirModalResena(cita: any) {
    this.citaResena = cita;
    this.resenaForm = { valoracion: 0, comentario: '', imagen: null };
    this.isResenaModalOpen = true;
  }

  cerrarModalResena() {
    this.isResenaModalOpen = false;
    this.citaResena = null;
  }

  async onResenaImageSelected(event: any) {
    const file: File = event?.target?.files?.[0];
    if (!file) {
      return;
    }

    this.procesandoImagenResena = true;
    this.errorImagenResena = '';
    try {
      this.resenaForm.imagen = await comprimirImagen(file, 'resena');
    } catch (error: any) {
      this.errorImagenResena = error?.message || 'No se pudo procesar la imagen.';
    } finally {
      this.procesandoImagenResena = false;
      event.target.value = '';
    }
  }

  quitarImagenResena() {
    this.resenaForm.imagen = null;
  }

  async enviarResena() {
    if (!this.citaResena || this.resenaForm.valoracion === 0 || this.enviandoResena) {
      return;
    }

    this.enviandoResena = true;
    try {
      await this.apiService.crearResena(this.citaResena._id || this.citaResena.id, {
        valoracion: this.resenaForm.valoracion,
        comentario: this.resenaForm.comentario,
        imagen: this.resenaForm.imagen
      });
      const toast = await this.toastCtrl.create({ message: '¡Gracias por tu reseña!', duration: 2000, color: 'success' });
      toast.present();
      this.cerrarModalResena();
      await this.loadMisCitas();
    } catch (error) {
      console.error('Error al enviar la reseña:', error);
      const toast = await this.toastCtrl.create({ message: 'No se pudo enviar la reseña.', duration: 2000, color: 'danger' });
      toast.present();
    } finally {
      this.enviandoResena = false;
    }
  }

  isActiveTab(tab: 'inicio' | 'citas' | 'perfil') {
    return this.currentTab === tab;
  }

  goToTab(tab: 'inicio' | 'citas' | 'perfil') {
    this.currentTab = tab;

    if (tab === 'inicio') {
      this.router.navigateByUrl('/client-home');
      return;
    }

    if (tab === 'citas') {
      this.router.navigateByUrl('/client-appointments');
      return;
    }

    this.router.navigateByUrl('/client-profile');
  }

  async logout() {
    const alert = await this.alertCtrl.create({
      header: 'Cerrar Sesión',
      message: '¿Estás seguro de que quieres cerrar sesión?',
      cssClass: 'premium-alert alert-centrado',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Cerrar Sesión',
          handler: async () => {
            await this.authService.logout();
            await this.storage.remove('user');
            this.navCtrl.navigateRoot('/login');
          }
        }
      ]
    });

    await alert.present();
  }
}