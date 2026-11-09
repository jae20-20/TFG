import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, NavController, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline, documentTextOutline, trashOutline, warningOutline } from 'ionicons/icons';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { StorageService } from '../../services/storage.service';

// trash-outline y document-text-outline los usan los botones de los perfiles que abren este modal
addIcons({ 'close-outline': closeOutline, 'document-text-outline': documentTextOutline, 'trash-outline': trashOutline, 'warning-outline': warningOutline });

type RolCuenta = 'cliente' | 'barbero' | 'admin';

interface ResumenEliminacion {
  rol: RolCuenta;
  barberiaNombre?: string;
  citasFuturas?: number;
  barberos?: number;
}

// Eliminar la cuenta (RGPD, derecho de supresión), compartido por los perfiles de cliente, barbero y dueño.
// Pide la contraseña actual. El dueño de una barbería además ve qué se borrará con ella y debe escribir su nombre
@Component({
  selector: 'app-eliminar-cuenta-modal',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  templateUrl: './eliminar-cuenta-modal.component.html',
  styleUrls: ['./eliminar-cuenta-modal.component.scss']
})
export class EliminarCuentaModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() rol: RolCuenta = 'cliente';
  @Output() cerrado = new EventEmitter<void>();

  private apiService = inject(ApiService);
  private authService = inject(AuthService);
  private storage = inject(StorageService);
  private navCtrl = inject(NavController);
  private toastCtrl = inject(ToastController);

  resumen: ResumenEliminacion | null = null;
  cargandoResumen = false;
  pw = '';
  nombreConfirmado = '';
  error = '';
  eliminando = false;

  // Solo el dueño de una barbería arrastra la barbería al eliminar su cuenta
  get esDuenio(): boolean {
    return this.rol === 'admin' && !!this.resumen?.barberiaNombre;
  }

  get puedeEliminar(): boolean {
    if (this.eliminando || this.cargandoResumen || !this.pw) return false;
    if (this.rol === 'admin' && !this.resumen) return false;
    return !this.esDuenio || this.nombreConfirmado.trim() === this.resumen?.barberiaNombre;
  }

  ngOnChanges(cambios: SimpleChanges) {
    if (cambios['isOpen']?.currentValue) {
      this.cargarResumen();
    }
  }

  // El aviso depende de lo que haya en el servidor en este momento (citas futuras, equipo)
  private async cargarResumen() {
    this.resumen = null;
    this.error = '';
    this.cargandoResumen = true;
    try {
      this.resumen = await this.apiService.getResumenEliminacion();
    } catch {
      this.error = 'No se ha podido preparar la eliminación. Inténtalo de nuevo.';
    } finally {
      this.cargandoResumen = false;
    }
  }

  async eliminar() {
    if (!this.puedeEliminar) return;

    this.eliminando = true;
    this.error = '';
    try {
      await this.apiService.eliminarMiCuenta(this.pw, this.esDuenio);
      await this.authService.logout();
      await this.storage.remove('user');
      this.cerrar();
      await this.navCtrl.navigateRoot('/login');
      const toast = await this.toastCtrl.create({ message: 'Tu cuenta se ha eliminado', duration: 3500, color: 'success', position: 'bottom' });
      await toast.present();
    } catch (error: any) {
      this.error = error?.error?.error || 'No se pudo eliminar la cuenta. Inténtalo de nuevo.';
    } finally {
      this.eliminando = false;
    }
  }

  cerrar() {
    this.pw = '';
    this.nombreConfirmado = '';
    this.error = '';
    this.resumen = null;
    this.cerrado.emit();
  }
}
