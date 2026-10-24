import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { ApiService } from '../../../services/api.service';
import { PhoneInputComponent } from '../../../components/phone-input/phone-input.component';
import { PhoneDisplayPipe } from '../../../components/phone-input/phone-display.pipe';
import { CambiarPasswordModalComponent } from '../../../components/cambiar-password-modal/cambiar-password-modal.component';

@Component({
  selector: 'app-barber-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, PhoneInputComponent, PhoneDisplayPipe, CambiarPasswordModalComponent]
})
export class BarberProfilePage implements OnInit {
  user: any = null;
  barberoEditForm: any = null;
  isEditingBarbero = false;
  isPasswordModalOpen = false;
  savingBarbero = false;
  barberoProfileError = '';

  constructor(
    private apiService: ApiService,
    private storage: Storage,
    private toastCtrl: ToastController
  ) { }

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

  private readAndCompressImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 400;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          const compressed = canvas.toDataURL('image/jpeg', 0.8);
          resolve(compressed);
        };
        img.onerror = (err) => reject(err);
        img.src = e.target.result;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
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
