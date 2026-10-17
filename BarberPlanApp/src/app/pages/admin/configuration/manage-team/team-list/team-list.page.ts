import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule, ToastController } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { ApiService } from '../../../../../services/api.service';

const CARGOS_PRESET = ['Barbero Profesional', 'Barbero Aprendiz', 'Estilista', 'Barbero Sénior'];

@Component({
  selector: 'app-team-list',
  templateUrl: './team-list.page.html',
  styleUrls: ['./team-list.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class TeamListPage implements OnInit {
  barberos: any[] = [];
  loading = false;
  error = '';
  currentUser: any;

  // Invitaciones pendientes
  invitaciones: any[] = [];
  loadingInvitaciones = false;

  // Modal "Añadir empleado"
  isAddModalOpen = false;
  addModalStage: 'form' | 'success' = 'form';
  cargosPreset = CARGOS_PRESET;
  cargoEsPersonalizado = false;
  nuevoEmpleado = { nombre: '', apellido: '', cargo: '' };
  creandoInvitacion = false;
  invitacionCreada: any = null;
  codigoCopiado = false;

  constructor(
    private apiService: ApiService,
    private router: Router,
    private storage: Storage,
    private toastCtrl: ToastController
  ) {}

  async ngOnInit() {
    await this.storage.create();
    this.currentUser = await this.storage.get('user');
    this.loadBarberos();
    this.loadInvitaciones();
  }

  async loadBarberos() {
    this.loading = true;
    this.error = '';
    try {
      const barberia = await this.apiService.getMyBarberia();
      const barberiaId = barberia?._id;
      if (barberiaId) {
        this.barberos = await this.apiService.getBarberosBarberia(barberiaId);
      } else {
        this.error = 'No se encontró la barbería del administrador.';
      }
    } catch (e) {
      console.error('Error loading barberos', e);
      this.error = 'No se pudieron cargar los barberos.';
    } finally {
      this.loading = false;
    }
  }

  async loadInvitaciones() {
    this.loadingInvitaciones = true;
    try {
      const invitaciones = await this.apiService.getInvitaciones();
      this.invitaciones = Array.isArray(invitaciones) ? invitaciones : [];
    } catch (e) {
      console.error('Error loading invitaciones', e);
    } finally {
      this.loadingInvitaciones = false;
    }
  }

  get invitacionesPendientes() {
    return this.invitaciones.filter(inv => inv.estado === 'pendiente' && !this.isExpirada(inv));
  }

  openBarberDetails(barberoId: string) {
    this.router.navigate([`/admin/configuration/manage-team/${barberoId}`]);
  }

  openBarber(barbero: any) {
    if (barbero && barbero._id) {
      if (this.isAdmin(barbero)) {
        this.router.navigate(['/admin/profile']);
      } else {
        this.openBarberDetails(barbero._id);
      }
    }
  }

  isAdmin(barbero: any): boolean {
    return this.currentUser && (barbero._id === this.currentUser.id || barbero._id === this.currentUser._id);
  }

  getInitials(barber: any): string {
    if (!barber) return 'BA';
    const nombre = (barber.nombre || '').trim();
    const apellido = (barber.apellido || '').trim();
    const initials = `${nombre.charAt(0)}${apellido.charAt(0)}`.trim();
    return initials || 'BA';
  }

  // ==================== MODAL AÑADIR EMPLEADO ====================

  openAddModal() {
    this.addModalStage = 'form';
    this.nuevoEmpleado = { nombre: '', apellido: '', cargo: '' };
    this.cargoEsPersonalizado = false;
    this.invitacionCreada = null;
    this.codigoCopiado = false;
    this.isAddModalOpen = true;
  }

  closeAddModal() {
    this.isAddModalOpen = false;
    // Si se acaba de generar un código, refrescamos el listado al cerrar
    if (this.invitacionCreada) {
      this.loadInvitaciones();
    }
  }

  selectCargoPreset(cargo: string) {
    this.cargoEsPersonalizado = false;
    this.nuevoEmpleado.cargo = cargo;
  }

  selectCargoPersonalizado() {
    this.cargoEsPersonalizado = true;
    this.nuevoEmpleado.cargo = '';
  }

  isFormValid(): boolean {
    return !!(this.nuevoEmpleado.nombre.trim() && this.nuevoEmpleado.apellido.trim() && this.nuevoEmpleado.cargo.trim());
  }

  async submitInvitacion() {
    if (!this.isFormValid() || this.creandoInvitacion) return;

    this.creandoInvitacion = true;
    try {
      const response = await this.apiService.createInvitacion({
        nombre: this.nuevoEmpleado.nombre.trim(),
        apellido: this.nuevoEmpleado.apellido.trim(),
        cargo: this.nuevoEmpleado.cargo.trim()
      });

      this.invitacionCreada = response.invitacion;
      this.addModalStage = 'success';
    } catch (e: any) {
      console.error('Error al crear invitación', e);
      const message = e?.error?.error || 'No se pudo generar el código.';
      const toast = await this.toastCtrl.create({ message, duration: 2500, color: 'danger', position: 'bottom' });
      await toast.present();
    } finally {
      this.creandoInvitacion = false;
    }
  }

  async copyCode() {
    if (!this.invitacionCreada?.codigo) return;
    try {
      await navigator.clipboard.writeText(this.invitacionCreada.codigo);
      this.codigoCopiado = true;
      setTimeout(() => (this.codigoCopiado = false), 2000);
    } catch (e) {
      const toast = await this.toastCtrl.create({ message: 'No se pudo copiar el código.', duration: 2000, color: 'danger' });
      await toast.present();
    }
  }

  async shareCode() {
    if (!this.invitacionCreada?.codigo) return;
    const texto = `¡Bienvenido a BarberPlan! Usa este código de invitación para crear tu cuenta de barbero: ${this.invitacionCreada.codigo}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Invitación BarberPlan', text: texto });
      } catch {
        // El usuario canceló el share; no hacer nada
      }
    } else {
      await this.copyCode();
    }
  }

  // ==================== GESTIÓN DE INVITACIONES ====================

  isExpirada(inv: any): boolean {
    return inv.estado === 'pendiente' && inv.expiresAt && new Date(inv.expiresAt) < new Date();
  }

  getEstadoLabel(inv: any): string {
    if (this.isExpirada(inv)) return 'Caducado';
    if (inv.estado === 'usada') return 'Usado';
    if (inv.estado === 'revocada') return 'Revocado';
    return 'Pendiente';
  }

  async regenerarInvitacion(inv: any, event: Event) {
    event.stopPropagation();
    try {
      const response = await this.apiService.regenerarInvitacion(inv._id);
      this.invitacionCreada = response.invitacion;
      this.addModalStage = 'success';
      this.isAddModalOpen = true;
      await this.loadInvitaciones();
    } catch (e: any) {
      console.error('Error al regenerar invitación', e);
      const message = e?.error?.error || 'No se pudo regenerar el código.';
      const toast = await this.toastCtrl.create({ message, duration: 2500, color: 'danger' });
      await toast.present();
    }
  }

  async revocarInvitacion(inv: any, event: Event) {
    event.stopPropagation();
    try {
      await this.apiService.revocarInvitacion(inv._id);
      const toast = await this.toastCtrl.create({ message: 'Invitación revocada.', duration: 2000, color: 'success' });
      await toast.present();
      await this.loadInvitaciones();
    } catch (e) {
      console.error('Error al revocar invitación', e);
      const toast = await this.toastCtrl.create({ message: 'No se pudo revocar la invitación.', duration: 2000, color: 'danger' });
      await toast.present();
    }
  }

  async eliminarInvitacion(inv: any, event: Event) {
    event.stopPropagation();
    try {
      await this.apiService.deleteInvitacion(inv._id);
      await this.loadInvitaciones();
    } catch (e) {
      console.error('Error al eliminar invitación', e);
    }
  }
}
