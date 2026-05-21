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
        telefono: this.user.telefono || ''
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
  }

  cancelAdminEdit() {
    this.isEditingAdmin = false;
    this.initializeAdminEditForm();
  }

  async saveAdminProfile() {
    if (!this.adminEditForm?.nombre || !this.adminEditForm?.apellido || !this.adminEditForm?.usuario) {
      this.profileError = 'Nombre, apellidos y usuario del administrador son obligatorios.';
      return;
    }

    this.savingAdmin = true;
    this.profileError = '';

    try {
      const response = await this.apiService.updateMyProfile(this.adminEditForm);
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
