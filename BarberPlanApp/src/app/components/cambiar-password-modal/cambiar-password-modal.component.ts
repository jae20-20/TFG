import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeOutline, keyOutline } from 'ionicons/icons';
import { ApiService } from '../../services/api.service';
import { MENSAJES_CREDENCIALES, validarPasswordNueva } from '../../services/validacion-credenciales.util';

// key-outline lo usan los botones de los perfiles que abren este modal
addIcons({ 'close-outline': closeOutline, 'key-outline': keyOutline });

// Modal de cambio de contraseña, compartido por los perfiles de cliente, barbero y dueño.
// La sesión sigue abierta tras el cambio.
@Component({
  selector: 'app-cambiar-password-modal',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  templateUrl: './cambiar-password-modal.component.html',
  styleUrls: ['./cambiar-password-modal.component.scss']
})
export class CambiarPasswordModalComponent {
  @Input() isOpen = false;
  @Output() cerrado = new EventEmitter<void>();

  private apiService = inject(ApiService);
  private toastCtrl = inject(ToastController);

  form = { actual: '', nueva: '', confirmar: '' };
  error = '';
  guardando = false;

  async guardar() {
    this.error = this.validar();
    if (this.error) return;

    this.guardando = true;
    try {
      await this.apiService.cambiarPassword(this.form.actual, this.form.nueva);
      const toast = await this.toastCtrl.create({ message: 'Contraseña actualizada correctamente', duration: 2500, color: 'success', position: 'bottom' });
      await toast.present();
      this.cerrar();
    } catch (error: any) {
      this.error = error?.error?.error || 'No se pudo cambiar la contraseña. Inténtalo de nuevo.';
    } finally {
      this.guardando = false;
    }
  }

  cerrar() {
    this.form = { actual: '', nueva: '', confirmar: '' };
    this.error = '';
    this.cerrado.emit();
  }

  private validar(): string {
    const { actual, nueva, confirmar } = this.form;
    if (!actual || !nueva || !confirmar) return 'Completa todos los campos';
    const errorPolitica = validarPasswordNueva(nueva);
    if (errorPolitica) return errorPolitica;
    if (nueva !== confirmar) return 'Las contraseñas nuevas no coinciden';
    if (nueva === actual) return MENSAJES_CREDENCIALES.pwIgualActual;
    return '';
  }
}
