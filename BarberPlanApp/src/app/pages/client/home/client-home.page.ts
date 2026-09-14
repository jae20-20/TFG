import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, NavigationEnd } from '@angular/router';
import { AlertController, IonicModule } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { ApiService } from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';
import { ThemeHeaderBtnComponent } from '../../../components/theme-header-btn/theme-header-btn.component';

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

import { addIcons } from 'ionicons';
import { cutOutline, logOutOutline, starOutline, locationOutline, timeOutline, homeOutline, calendarOutline, personOutline, chevronDownOutline, optionsOutline } from 'ionicons/icons';

@Component({
  selector: 'app-client-home',
  templateUrl: './client-home.page.html',
  styleUrls: ['./client-home.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, ThemeHeaderBtnComponent]
})
export class ClientHomePage implements OnInit {
  user: any = null;
  barberias: BarberiaPublica[] = [];
  loadingBarberias = false;
  barberiasError = '';
  currentTab: 'inicio' | 'citas' | 'perfil' = 'inicio';
  ciudadesDisponibles: string[] = [];
  ciudadSeleccionada: string = 'Todas';

  // Estados del modal de filtros
  isFilterModalOpen = false;
  filtroSoloPremium = false;
  filtroOrden = 'defecto';

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private storage: Storage,
    private router: Router,
    private alertCtrl: AlertController,
    private cdr: ChangeDetectorRef
  ) {
    addIcons({
      'cut-outline': cutOutline,
      'log-out-outline': logOutOutline,
      'star-outline': starOutline,
      'location-outline': locationOutline,
      'time-outline': timeOutline,
      'home-outline': homeOutline,
      'calendar-outline': calendarOutline,
      'person-outline': personOutline,
      'chevron-down-outline': chevronDownOutline,
      'options-outline': optionsOutline
    });

    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        if (this.router.url.startsWith('/client-home') || this.router.url === '/client') {
          this.currentTab = 'inicio';
          this.cdr.detectChanges();
        }
      }
    });
  }

  ionViewWillEnter() {
    this.currentTab = 'inicio';
    this.cdr.detectChanges();
  }

  async ngOnInit() {
    await this.storage.create();
    this.user = await this.storage.get('user');
    this.currentTab = 'inicio';
    await this.loadBarberias();
  }

  async loadBarberias() {
    this.loadingBarberias = true;
    this.barberiasError = '';

    try {
      const response = await this.apiService.getBarberias();
      const barberias = Array.isArray(response) ? response : [];
      this.barberias = barberias.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
      
      const cities = this.barberias
        .map(b => (b.ciudad || '').trim())
        .filter(c => c.length > 0);
      this.ciudadesDisponibles = [...new Set(cities)].sort();
    } catch (error) {
      console.error('Error al cargar barberías:', error);
      this.barberiasError = 'No se pudieron cargar las barberías disponibles.';
      this.barberias = [];
    } finally {
      this.loadingBarberias = false;
    }
  }

  getBarberiasFiltradas() {
    let filtradas = [...this.barberias];

    if (this.ciudadSeleccionada !== 'Todas') {
      filtradas = filtradas.filter(b => (b.ciudad || '').trim() === this.ciudadSeleccionada);
    }

    if (this.filtroSoloPremium) {
      filtradas = filtradas.filter(b => (b as any)?.esPremium || (b as any)?.destacada);
    }

    if (this.filtroOrden === 'valoracion') {
      filtradas.sort((a, b) => {
        const ratingA = Number((a as any)?.rating ?? (a as any)?.valoracion ?? 4.8);
        const ratingB = Number((b as any)?.rating ?? (b as any)?.valoracion ?? 4.8);
        return ratingB - ratingA;
      });
    } else {
      // Por defecto ordenadas por nombre (ya están así por defecto, pero por si acaso)
      filtradas.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
    }

    return filtradas;
  }

  // --- Modal de Filtros ---
  openFilterModal() {
    this.isFilterModalOpen = true;
  }

  closeFilterModal() {
    this.isFilterModalOpen = false;
  }

  resetFiltros() {
    this.ciudadSeleccionada = 'Todas';
    this.filtroSoloPremium = false;
    this.filtroOrden = 'defecto';
    this.closeFilterModal();
  }

  aplicarFiltros() {
    this.closeFilterModal();
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
      cssClass: 'premium-alert',
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
