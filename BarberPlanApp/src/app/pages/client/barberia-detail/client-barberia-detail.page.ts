import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NavController, IonicModule, ToastController, AlertController } from '@ionic/angular';
import { ApiService } from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';
import { Storage } from '@ionic/storage-angular';
import { ThemeHeaderBtnComponent } from '../../../components/theme-header-btn/theme-header-btn.component';
import { StarRatingComponent } from '../../../components/star-rating/star-rating.component';
import { ReviewImageComponent } from '../../../components/review-image/review-image.component';
import { addIcons } from 'ionicons';
import { logOutOutline, arrowBackOutline } from 'ionicons/icons';

interface ReservaForm {
  servicioId: string;
  barberoId: string;
  fecha: string;
  horaInicio: string;
}

@Component({
  selector: 'app-client-barberia-detail',
  templateUrl: './client-barberia-detail.page.html',
  styleUrls: ['./client-barberia-detail.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, ThemeHeaderBtnComponent, StarRatingComponent, ReviewImageComponent]
})
export class ClientBarberiaDetailPage implements OnInit {
  // Al cerrar sesión, navigateRoot destruye las pantallas abiertas: la siguiente sesión empieza sin el estado de la anterior
  private navCtrl = inject(NavController);
  barberiaId = '';
  barberia: any = null;
  servicios: any[] = [];
  barberos: any[] = [];
  resenas: any[] = [];
  galeriaExpanded = false;
  private readonly galeriaPreviewLimit = 6;

  loading = false;
  error = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private apiService: ApiService,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private authService: AuthService,
    private storage: Storage
  ) {
    addIcons({ logOutOutline, arrowBackOutline });
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
    } catch (error) {
      console.error('Error al cargar detalle de barbería:', error);
      this.error = 'No se pudo cargar el detalle de la barbería.';
    } finally {
      this.loading = false;
    }

    await this.loadResenas();
  }

  private async loadResenas() {
    try {
      const resenas = await this.apiService.getResenasBarberia(this.barberiaId);
      this.resenas = Array.isArray(resenas) ? resenas : [];
    } catch (error) {
      console.error('Error al cargar reseñas de la barbería:', error);
      this.resenas = [];
    }
  }

  get promedioValoracion(): number {
    if (this.resenas.length === 0) {
      return 0;
    }
    const suma = this.resenas.reduce((acc, r) => acc + (r.resena?.valoracion || 0), 0);
    return Math.round((suma / this.resenas.length) * 10) / 10;
  }

  getClienteNombreResena(resena: any): string {
    const nombre = resena?.cliente?.nombre || '';
    const apellido = resena?.cliente?.apellido || '';
    return `${nombre} ${apellido}`.trim() || 'Cliente';
  }

  getClienteInicialesResena(resena: any): string {
    const nombre = (resena?.cliente?.nombre || '').trim();
    const apellido = (resena?.cliente?.apellido || '').trim();
    const iniciales = `${nombre.charAt(0)}${apellido.charAt(0)}`.trim();
    return iniciales.toUpperCase() || 'CL';
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

  getGaleria(): string[] {
    return Array.isArray(this.barberia?.galeriaTrabajos) ? this.barberia.galeriaTrabajos : [];
  }

  getGaleriaVisible(): string[] {
    const galeria = this.getGaleria();
    return this.galeriaExpanded ? galeria : galeria.slice(0, this.galeriaPreviewLimit);
  }

  getGaleriaRestCount(): number {
    if (this.galeriaExpanded) {
      return 0;
    }
    return Math.max(0, this.getGaleria().length - this.galeriaPreviewLimit);
  }

  expandGaleria() {
    this.galeriaExpanded = true;
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

    return `${precio.toFixed(2).replace('.', ',')} €`;
  }

  goToBooking() {
    if (!this.barberiaId) {
      return;
    }

    this.router.navigate(['/client-home/barberia', this.barberiaId, 'reservar']);
  }

  goBack() {
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
            this.navCtrl.navigateRoot('/login');
          }
        }
      ]
    });
    await alert.present();
  }
}
