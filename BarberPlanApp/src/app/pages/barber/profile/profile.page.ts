import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { ApiService } from '../../../services/api.service';

@Component({
  selector: 'app-barber-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class BarberProfilePage implements OnInit {
  user: any = null;
  barberoEditForm: any = null;
  isEditingBarbero = false;
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
        correo: ''
      };
      return;
    }

    this.barberoEditForm = {
      nombre: this.user.nombre || '',
      apellido: this.user.apellido || '',
      usuario: this.user.usuario || '',
      telefono: this.user.telefono || '',
      correo: this.user.correo || ''
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
        telefono: this.barberoEditForm.telefono
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
