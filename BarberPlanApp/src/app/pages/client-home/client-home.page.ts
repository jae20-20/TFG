import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AlertController, IonicModule } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

interface BarberiaPublica {
  _id: string;
  nombre: string;
  direccion?: string;
  ciudad?: string;
  descripcion?: string;
  telefono?: string;
  imagen?: string;
  logoUrl?: string;
  portadaUrl?: string;
  galeriaTrabajos?: string[];
  servicios?: any[];
}

@Component({
  selector: 'app-client-home',
  templateUrl: './client-home.page.html',
  styleUrls: ['./client-home.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class ClientHomePage implements OnInit {
  user: any = null;
  barberias: BarberiaPublica[] = [];
  loadingBarberias = false;
  barberiasError = '';
  currentTab: 'inicio' | 'citas' | 'perfil' = 'inicio';

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private storage: Storage,
    private router: Router,
    private alertCtrl: AlertController
  ) {}

  async ngOnInit() {
    await this.storage.create();
    this.user = await this.storage.get('user');
    this.currentTab = this.router.url.startsWith('/client-appointments')
      ? 'citas'
      : this.router.url.startsWith('/client-profile')
        ? 'perfil'
        : 'inicio';
    await this.loadBarberias();
  }

  async loadBarberias() {
    this.loadingBarberias = true;
    this.barberiasError = '';

    try {
      const response = await this.apiService.getBarberias();
      const barberias = Array.isArray(response) ? response : [];
      this.barberias = barberias.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
    } catch (error) {
      console.error('Error al cargar barberías:', error);
      this.barberiasError = 'No se pudieron cargar las barberías disponibles.';
      this.barberias = [];
    } finally {
      this.loadingBarberias = false;
    }
  }

  getCoverImage(barberia: BarberiaPublica) {
    return barberia.portadaUrl || barberia.imagen || '';
  }

  getLogoImage(barberia: BarberiaPublica) {
    return barberia.logoUrl || '';
  }

  getServiciosCount(barberia: BarberiaPublica) {
    return Array.isArray(barberia.servicios) ? barberia.servicios.length : 0;
  }

  getUbicacion(barberia: BarberiaPublica) {
    return [barberia.direccion, barberia.ciudad].filter(Boolean).join(', ') || 'Ubicación no disponible';
  }

  getRating(barberia: BarberiaPublica) {
    const rating = Number((barberia as any)?.rating ?? (barberia as any)?.valoracion ?? 4.8);
    return Number.isFinite(rating) ? rating.toFixed(1) : '4.8';
  }

  getCardBadge(barberia: BarberiaPublica) {
    if ((barberia as any)?.esPremium) {
      return 'Premium';
    }

    if ((barberia as any)?.destacada) {
      return 'Destacada';
    }

    if ((barberia as any)?.nueva) {
      return 'Nueva';
    }

    return 'Disponible';
  }

  isActiveTab(tab: 'inicio' | 'citas' | 'perfil') {
    return this.currentTab === tab;
  }

  trackByBarberia(index: number, barberia: BarberiaPublica) {
    return barberia._id || index;
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

  goToBarberiaDetail(barberiaId: string) {
    if (!barberiaId) {
      return;
    }

    this.router.navigate(['/client-home/barberia', barberiaId]);
  }

  async logout() {
    const alert = await this.alertCtrl.create({
      header: 'Cerrar Sesión',
      message: '¿Estás seguro de que quieres cerrar sesión?',
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
            this.router.navigateByUrl('/login', { replaceUrl: true });
          }
        }
      ]
    });

    await alert.present();
  }
}
