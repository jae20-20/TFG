import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule, ToastController } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { ApiService } from '../../../services/api.service';
import { PhoneInputComponent } from '../../../components/phone-input/phone-input.component';
import { PhoneDisplayPipe } from '../../../components/phone-input/phone-display.pipe';
import { CambiarPasswordModalComponent } from '../../../components/cambiar-password-modal/cambiar-password-modal.component';
import { EliminarCuentaModalComponent } from '../../../components/eliminar-cuenta-modal/eliminar-cuenta-modal.component';
import { comprimirImagen } from '../../../services/imagen.util';

@Component({
  selector: 'app-barber-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, PhoneInputComponent, PhoneDisplayPipe, CambiarPasswordModalComponent, EliminarCuentaModalComponent]
})
export class BarberProfilePage implements OnInit {
  user: any = null;
  barberoEditForm: any = null;
  isEditingBarbero = false;
  isPasswordModalOpen = false;
  isEliminarCuentaOpen = false;
  savingBarbero = false;
  barberoProfileError = '';

  constructor(
    private apiService: ApiService,
    private storage: Storage,
    private toastCtrl: ToastController,
    private router: Router
  ) { }

  verPrivacidad() {
    this.router.navigateByUrl('/privacidad');
  }

  async ngOnInit() {
    await this.storage.create();
    this.user = await this.storage.get('user');
    this.initializeBarberoEditForm();
    await this.loadBarberoProfile();
  }

  private initializeBarberoEditForm() {
    if (!this.user) {
      this.barberoEditForm = {
        nombre: '',
        apellido: '',
        usuario: '',
        telefono: '',
        correo: '',
        avatar: ''
      };
      return;
    }

    this.barberoEditForm = {
      nombre: this.user.nombre || '',
      apellido: this.user.apellido || '',
      usuario: this.user.usuario || '',
      telefono: this.user.telefono || '',
      correo: this.user.correo || '',
      avatar: this.user.avatar || ''
    };
  }

  async loadBarberoProfile() {
    try {
      const profile = await this.apiService.getMyProfile();
      this.user = { ...this.user, ...profile };
      await this.storage.set('user', this.user);
      this.initializeBarberoEditForm();
    } catch (error) {
      console.error('Error al cargar perfil de barbero:', error);
      this.initializeBarberoEditForm();
    }
  }

  enterBarberoEditMode() {
    this.isEditingBarbero = true;
    this.barberoProfileError = '';
  }

  cancelBarberoEdit() {
    this.isEditingBarbero = false;
    this.barberoProfileError = '';
    this.initializeBarberoEditForm();
  }

  async onAvatarSelected(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const base64 = await this.readAndCompressImage(file);
      if (!this.barberoEditForm) {
        this.initializeBarberoEditForm();
      }
      this.barberoEditForm.avatar = base64;
    } catch (err) {
      console.error('Error al procesar la imagen:', err);
      const toast = await this.toastCtrl.create({
        message: 'No se pudo procesar la imagen.',
        duration: 2000,
        position: 'bottom',
        color: 'danger'
      });
      await toast.present();
    }
  }

  removeAvatar(event?: any) {
    if (event) {
      event.stopPropagation();
    }
    if (!this.barberoEditForm) {
      this.initializeBarberoEditForm();
    }
    this.barberoEditForm.avatar = '';
  }

  // Reduce y comprime a JPEG (256 px, calidad 0,7, máx. 40 KB): ver services/imagen.util.ts
  private readAndCompressImage(file: File): Promise<string> {
    return comprimirImagen(file, 'avatar');
  }

  getInitials() {
    const source = this.user || {};
    const nombre = (source.nombre || '').trim();
    const apellido = (source.apellido || '').trim();
    const initials = `${nombre.charAt(0)}${apellido.charAt(0)}`.trim();
    return initials || 'BA';
  }

  async saveBarberoProfile() {
    if (!this.barberoEditForm?.nombre || !this.barberoEditForm?.apellido || !this.barberoEditForm?.usuario) {
      this.barberoProfileError = 'Nombre, apellidos y usuario son obligatorios.';
      return;
    }

    this.savingBarbero = true;
    this.barberoProfileError = '';

    try {
      const response = await this.apiService.updateMyProfile({
        nombre: this.barberoEditForm.nombre,
        apellido: this.barberoEditForm.apellido,
        usuario: this.barberoEditForm.usuario,
        telefono: this.barberoEditForm.telefono,
        avatar: this.barberoEditForm.avatar || ''
      });

      const updatedUser = response?.user || this.barberoEditForm;
      this.user = { ...this.user, ...updatedUser };
      await this.storage.set('user', this.user);

      this.initializeBarberoEditForm();
      this.isEditingBarbero = false;

      const toast = await this.toastCtrl.create({
        message: 'Perfil actualizado correctamente',
        duration: 2000,
        position: 'bottom',
        color: 'success'
      });
      await toast.present();
    } catch (error) {
      console.error('Error al guardar perfil de barbero:', error);
      this.barberoProfileError = 'No se ha podido guardar el perfil.';

      const toast = await this.toastCtrl.create({
        message: 'Error al guardar perfil',
        duration: 2000,
        position: 'bottom',
        color: 'danger'
      });
      await toast.present();
    } finally {
      this.savingBarbero = false;
    }
  }
}
