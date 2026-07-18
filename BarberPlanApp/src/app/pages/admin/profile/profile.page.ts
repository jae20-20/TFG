import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { ApiService } from '../../../services/api.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class ProfilePage implements OnInit {
  user: any = null;
  adminEditForm: any = null;
  isEditingAdmin = false;
  savingAdmin = false;
  profileError = '';

  constructor(
    private apiService: ApiService,
    private storage: Storage,
    private toastCtrl: ToastController
  ) { }

  async ngOnInit() {
    await this.storage.create();
    this.user = await this.storage.get('user');
    await this.loadAdminProfile();
  }

  private initializeAdminEditForm() {
    if (this.user) {
      this.adminEditForm = {
        nombre: this.user.nombre || '',
        apellido: this.user.apellido || '',
        usuario: this.user.usuario || '',
        telefono: this.user.telefono || '',
        avatar: this.user.avatar || ''
      };
    }
  }

  async loadAdminProfile() {
    try {
      const profile = await this.apiService.getMyProfile();
      this.user = { ...this.user, ...profile };
      await this.storage.set('user', this.user);
      this.initializeAdminEditForm();
    } catch (error) {
      console.error('Error al cargar perfil de administrador:', error);
      this.initializeAdminEditForm();
    }
  }

  enterAdminEditMode() {
    this.isEditingAdmin = true;
    this.profileError = '';
  }

  cancelAdminEdit() {
    this.isEditingAdmin = false;
    this.profileError = '';
    this.initializeAdminEditForm();
  }

  async onAvatarSelected(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const base64 = await this.readAndCompressImage(file);
      if (!this.adminEditForm) {
        this.initializeAdminEditForm();
      }
      this.adminEditForm.avatar = base64;
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
    if (!this.adminEditForm) {
      this.initializeAdminEditForm();
    }
    this.adminEditForm.avatar = '';
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
    return initials || 'AD';
  }

  async saveAdminProfile() {
    if (!this.adminEditForm?.nombre || !this.adminEditForm?.apellido || !this.adminEditForm?.usuario) {
      this.profileError = 'Nombre, apellidos y usuario del administrador son obligatorios.';
      return;
    }

    this.savingAdmin = true;
    this.profileError = '';

    try {
      const response = await this.apiService.updateMyProfile({
        nombre: this.adminEditForm.nombre,
        apellido: this.adminEditForm.apellido,
        usuario: this.adminEditForm.usuario,
        telefono: this.adminEditForm.telefono,
        avatar: this.adminEditForm.avatar || ''
      });
      const updatedUser = response?.user || this.adminEditForm;

      this.user = { ...this.user, ...updatedUser };
      await this.storage.set('user', this.user);

      this.initializeAdminEditForm();
      this.isEditingAdmin = false;

      const toast = await this.toastCtrl.create({
        message: 'Datos del administrador actualizados correctamente',
        duration: 2000,
        position: 'bottom',
        color: 'success'
      });
      await toast.present();
    } catch (error) {
      console.error('Error al guardar datos del administrador:', error);
      this.profileError = 'No se han podido guardar los datos del administrador.';

      const toast = await this.toastCtrl.create({
        message: 'Error al actualizar el administrador',
        duration: 2000,
        position: 'bottom',
        color: 'danger'
      });
      await toast.present();
    } finally {
      this.savingAdmin = false;
    }
  }
}
