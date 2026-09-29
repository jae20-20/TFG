import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, NavigationEnd } from '@angular/router';
import { AlertController, IonicModule } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { ApiService } from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';
import { ThemeHeaderBtnComponent } from '../../../components/theme-header-btn/theme-header-btn.component';

interface ServicioBarberia {
  _id?: string;
  nombre?: string;
  descripcion?: string;
  precio?: number;
  duracion?: number;
}

interface FranjaHoraria {
  start?: string;
  end?: string;
}

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
  tags?: string[];
  servicios?: ServicioBarberia[];
  barberos?: string[];
  schedule?: {
    timezone?: string;
    weeklyTemplate?: Record<string, FranjaHoraria[]>;
  };
}

type OrdenBarberia = 'nombre' | 'precio' | 'servicios';

interface FiltrosBarberia {
  ciudad: string;
  servicio: string;
  tags: string[];
  precioMax: number | null;
  soloAbiertasHoy: boolean;
  orden: OrdenBarberia;
}

interface ChipFiltro {
  id: keyof FiltrosBarberia;
  label: string;
  valor?: string;
}

const CIUDAD_TODAS = 'Todas';
const SERVICIO_TODOS = 'Todos';
const DIAS_SEMANA = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

import { addIcons } from 'ionicons';
import {
  cutOutline,
  logOutOutline,
  starOutline,
  locationOutline,
  timeOutline,
  homeOutline,
  calendarOutline,
  personOutline,
  chevronDownOutline,
  optionsOutline,
  searchOutline,
  closeOutline,
  closeCircle,
  pricetagOutline,
  peopleOutline
} from 'ionicons/icons';

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
  barberiasFiltradas: BarberiaPublica[] = [];
  loadingBarberias = false;
  barberiasError = '';
  currentTab: 'inicio' | 'citas' | 'perfil' = 'inicio';

  busqueda = '';
  filtros: FiltrosBarberia = ClientHomePage.filtrosPorDefecto();
  filtrosDraft: FiltrosBarberia = ClientHomePage.filtrosPorDefecto();

  // Facetas derivadas del catálogo real de barberías
  ciudadesDisponibles: string[] = [];
  serviciosDisponibles: string[] = [];
  tagsDisponibles: string[] = [];
  precioTecho = 0;

  isFilterModalOpen = false;
  resultadosDraft = 0;

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
      'options-outline': optionsOutline,
      'search-outline': searchOutline,
      'close-outline': closeOutline,
      'close-circle': closeCircle,
      'pricetag-outline': pricetagOutline,
      'people-outline': peopleOutline
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
      this.barberias = Array.isArray(response) ? response : [];
      this.calcularFacetas();
      this.aplicarCiudadDelCliente();
    } catch (error) {
      console.error('Error al cargar barberías:', error);
      this.barberiasError = 'No se pudieron cargar las barberías disponibles.';
      this.barberias = [];
      this.ciudadesDisponibles = [];
      this.serviciosDisponibles = [];
      this.precioTecho = 0;
    } finally {
      this.loadingBarberias = false;
      this.recalcularResultados();
    }
  }

  // ==================== ESTADO DE FILTROS ====================

  private static filtrosPorDefecto(): FiltrosBarberia {
    return {
      ciudad: CIUDAD_TODAS,
      servicio: SERVICIO_TODOS,
      tags: [],
      precioMax: null,
      soloAbiertasHoy: false,
      orden: 'nombre'
    };
  }

  private calcularFacetas() {
    const ciudades = new Set<string>();
    const servicios = new Map<string, string>();
    const tags = new Map<string, string>();
    let precioMaximo = 0;

    for (const barberia of this.barberias) {
      const ciudad = (barberia.ciudad || '').trim();
      if (ciudad) {
        ciudades.add(ciudad);
      }

      for (const tag of barberia.tags || []) {
        const nombre = (tag || '').trim();
        if (nombre && !tags.has(this.normalizar(nombre))) {
          tags.set(this.normalizar(nombre), nombre);
        }
      }

      for (const servicio of barberia.servicios || []) {
        const nombre = (servicio?.nombre || '').trim();
        if (nombre && !servicios.has(this.normalizar(nombre))) {
          servicios.set(this.normalizar(nombre), nombre);
        }

        const precio = Number(servicio?.precio);
        if (Number.isFinite(precio) && precio > precioMaximo) {
          precioMaximo = precio;
        }
      }
    }

    this.ciudadesDisponibles = [...ciudades].sort((a, b) => a.localeCompare(b, 'es'));
    this.serviciosDisponibles = [...servicios.values()].sort((a, b) => a.localeCompare(b, 'es'));
    this.tagsDisponibles = [...tags.values()].sort((a, b) => a.localeCompare(b, 'es'));
    this.precioTecho = precioMaximo > 0 ? Math.ceil(precioMaximo / 5) * 5 : 0;
  }

  // La ciudad es obligatoria en el registro de cliente: se usa como filtro inicial.
  private aplicarCiudadDelCliente() {
    const ciudadCliente = (this.user?.ciudad || '').trim();
    if (ciudadCliente && this.ciudadesDisponibles.includes(ciudadCliente)) {
      this.filtros.ciudad = ciudadCliente;
    }
  }

  private normalizar(valor: string) {
    return valor
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim();
  }

  private filtrar(filtros: FiltrosBarberia, busqueda: string): BarberiaPublica[] {
    const termino = this.normalizar(busqueda);
    const servicioBuscado = filtros.servicio !== SERVICIO_TODOS ? this.normalizar(filtros.servicio) : '';

    const resultado = this.barberias.filter((barberia) => {
      if (termino) {
        const nombresServicios = (barberia.servicios || []).map((servicio) => servicio?.nombre || '');
        const texto = this.normalizar(
          [barberia.nombre, barberia.descripcion, barberia.direccion, barberia.ciudad, ...nombresServicios]
            .filter(Boolean)
            .join(' ')
        );
        if (!texto.includes(termino)) {
          return false;
        }
      }

      if (filtros.ciudad !== CIUDAD_TODAS && (barberia.ciudad || '').trim() !== filtros.ciudad) {
        return false;
      }

      if (servicioBuscado) {
        const ofrece = (barberia.servicios || []).some(
          (servicio) => this.normalizar(servicio?.nombre || '') === servicioBuscado
        );
        if (!ofrece) {
          return false;
        }
      }

      if (filtros.tags.length > 0) {
        const tagsBarberia = (barberia.tags || []).map((tag) => this.normalizar(tag));
        const coincide = filtros.tags.some((tag) => tagsBarberia.includes(this.normalizar(tag)));
        if (!coincide) {
          return false;
        }
      }

      if (filtros.precioMax !== null) {
        const desde = this.getPrecioDesde(barberia);
        if (desde === null || desde > filtros.precioMax) {
          return false;
        }
      }

      if (filtros.soloAbiertasHoy && !this.abreHoy(barberia)) {
        return false;
      }

      return true;
    });

    return this.ordenar(resultado, filtros.orden);
  }

  private ordenar(barberias: BarberiaPublica[], orden: OrdenBarberia): BarberiaPublica[] {
    const porNombre = (a: BarberiaPublica, b: BarberiaPublica) =>
      (a.nombre || '').localeCompare(b.nombre || '', 'es');

    if (orden === 'precio') {
      return barberias.sort((a, b) => {
        const precioA = this.getPrecioDesde(a);
        const precioB = this.getPrecioDesde(b);
        if (precioA === null && precioB === null) return porNombre(a, b);
        if (precioA === null) return 1;
        if (precioB === null) return -1;
        return precioA - precioB || porNombre(a, b);
      });
    }

    if (orden === 'servicios') {
      return barberias.sort(
        (a, b) => this.getServiciosCount(b) - this.getServiciosCount(a) || porNombre(a, b)
      );
    }

    return barberias.sort(porNombre);
  }

  private recalcularResultados() {
    this.barberiasFiltradas = this.filtrar(this.filtros, this.busqueda);
  }

  onBusquedaChange() {
    this.recalcularResultados();
  }

  limpiarBusqueda() {
    this.busqueda = '';
    this.recalcularResultados();
  }

  // ==================== CHIPS DE FILTROS ACTIVOS ====================

  get chipsActivos(): ChipFiltro[] {
    const chips: ChipFiltro[] = [];

    if (this.filtros.ciudad !== CIUDAD_TODAS) {
      chips.push({ id: 'ciudad', label: this.filtros.ciudad });
    }

    if (this.filtros.servicio !== SERVICIO_TODOS) {
      chips.push({ id: 'servicio', label: this.filtros.servicio });
    }

    for (const tag of this.filtros.tags) {
      chips.push({ id: 'tags', label: tag, valor: tag });
    }

    if (this.filtros.precioMax !== null) {
      chips.push({ id: 'precioMax', label: `Hasta ${this.filtros.precioMax} €` });
    }

    if (this.filtros.soloAbiertasHoy) {
      chips.push({ id: 'soloAbiertasHoy', label: 'Abiertas hoy' });
    }

    if (this.filtros.orden !== 'nombre') {
      chips.push({ id: 'orden', label: this.getEtiquetaOrden(this.filtros.orden) });
    }

    return chips;
  }

  get totalFiltrosActivos() {
    return this.chipsActivos.length;
  }

  getEtiquetaOrden(orden: OrdenBarberia) {
    if (orden === 'precio') return 'Precio más bajo';
    if (orden === 'servicios') return 'Más servicios';
    return 'Nombre (A-Z)';
  }

  quitarFiltro(chip: ChipFiltro) {
    if (chip.id === 'tags' && chip.valor !== undefined) {
      this.filtros.tags = this.filtros.tags.filter((tag) => tag !== chip.valor);
      this.recalcularResultados();
      return;
    }

    const defecto = ClientHomePage.filtrosPorDefecto();
    (this.filtros as any)[chip.id] = defecto[chip.id];
    this.recalcularResultados();
  }

  limpiarTodo() {
    this.filtros = ClientHomePage.filtrosPorDefecto();
    this.busqueda = '';
    this.recalcularResultados();
  }

  // ==================== BOTTOM SHEET ====================

  openFilterModal() {
    this.filtrosDraft = { ...this.filtros };
    this.actualizarPrevisualizacion();
    this.isFilterModalOpen = true;
  }

  closeFilterModal() {
    this.isFilterModalOpen = false;
  }

  actualizarPrevisualizacion() {
    this.resultadosDraft = this.filtrar(this.filtrosDraft, this.busqueda).length;
  }

  seleccionarCiudad(ciudad: string) {
    this.filtrosDraft.ciudad = ciudad;
    this.actualizarPrevisualizacion();
  }

  seleccionarServicio(servicio: string) {
    this.filtrosDraft.servicio = servicio;
    this.actualizarPrevisualizacion();
  }

  toggleTagDraft(tag: string) {
    const yaSeleccionado = this.filtrosDraft.tags.includes(tag);
    this.filtrosDraft.tags = yaSeleccionado
      ? this.filtrosDraft.tags.filter((t) => t !== tag)
      : [...this.filtrosDraft.tags, tag];
    this.actualizarPrevisualizacion();
  }

  seleccionarOrden(orden: OrdenBarberia) {
    this.filtrosDraft.orden = orden;
    this.actualizarPrevisualizacion();
  }

  onPrecioChange(event: CustomEvent) {
    const valor = Number((event.detail as any)?.value);
    this.filtrosDraft.precioMax = valor >= this.precioTecho ? null : valor;
    this.actualizarPrevisualizacion();
  }

  get precioDraftVisible() {
    return this.filtrosDraft.precioMax ?? this.precioTecho;
  }

  onDisponibilidadChange() {
    this.actualizarPrevisualizacion();
  }

  restablecerFiltros() {
    this.filtrosDraft = ClientHomePage.filtrosPorDefecto();
    this.actualizarPrevisualizacion();
  }

  aplicarFiltros() {
    this.filtros = { ...this.filtrosDraft };
    this.recalcularResultados();
    this.closeFilterModal();
  }

  // ==================== DATOS DE TARJETA ====================

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

  getPrecioDesde(barberia: BarberiaPublica): number | null {
    const precios = (barberia.servicios || [])
      .map((servicio) => Number(servicio?.precio))
      .filter((precio) => Number.isFinite(precio) && precio > 0);

    return precios.length > 0 ? Math.min(...precios) : null;
  }

  abreHoy(barberia: BarberiaPublica) {
    const dia = DIAS_SEMANA[new Date().getDay()];
    const franjas = barberia.schedule?.weeklyTemplate?.[dia];
    return Array.isArray(franjas) && franjas.length > 0;
  }

  getDisponibilidadLabel(barberia: BarberiaPublica) {
    return this.abreHoy(barberia) ? 'Abierta hoy' : 'Cerrada hoy';
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
