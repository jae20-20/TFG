import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { IonicModule, ToastController } from '@ionic/angular';
import { ApiService } from '../../../../services/api.service';

@Component({
  selector: 'app-barbershop-details',
  templateUrl: './barbershop-details.page.html',
  styleUrls: ['./barbershop-details.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, RouterModule]
})
export class BarbershopDetailsPage implements OnInit {
  barberia: any = null;
  barberiaEditForm: any = null;
  isEditingPerfil = false;
  savingPerfil = false;
  barberiaError = '';
  loadingBarberia = false;
  ciudades = ['Madrid', 'Valencia', 'Sevilla'];

  constructor(
    private apiService: ApiService,
    private toastCtrl: ToastController
  ) { }

  ngOnInit() {
    this.loadBarberiaData();
  }

  async loadBarberiaData() {
    this.loadingBarberia = true;
    this.barberiaError = '';

    try {
      this.barberia = await this.apiService.getMyBarberia();
      this.initializeEditForm();
    } catch (error) {
      console.error('Error al cargar la barbería:', error);
      this.barberiaError = 'No se han podido cargar los datos de la barbería.';
      this.barberia = null;
    } finally {
      this.loadingBarberia = false;
    }
  }

  private initializeEditForm() {
    if (this.barberia) {
      this.barberiaEditForm = {
        nombre: this.barberia.nombre,
        ciudad: this.barberia.ciudad || '',
        direccion: this.barberia.direccion,
        telefono: this.barberia.telefono,
        descripcion: this.barberia.descripcion
      };
    }
  }

  enterEditMode() {
    this.isEditingPerfil = true;
  }

  cancelEdit() {
    this.isEditingPerfil = false;
    this.initializeEditForm();
  }

  async savePerfil() {
    if (!this.barberia || !this.barberia._id) {
      this.barberiaError = 'Error: No se encontró el ID de la barbería.';
      return;
    }

    if (!this.barberiaEditForm.nombre || !this.barberiaEditForm.ciudad || !this.barberiaEditForm.direccion) {
      this.barberiaError = 'El nombre, la ciudad y la dirección son requeridos.';
      return;
    }

    this.savingPerfil = true;
    this.barberiaError = '';

    try {
      await this.apiService.updateBarberia(this.barberia._id, this.barberiaEditForm);
      await this.loadBarberiaData();
      this.isEditingPerfil = false;
      
      const toast = await this.toastCtrl.create({
        message: 'Barbería actualizada correctamente',
        duration: 2000,
        position: 'bottom',
        color: 'success'
      });
      await toast.present();
    } catch (error) {
      console.error('Error al guardar la barbería:', error);
      this.barberiaError = 'No se han podido guardar los cambios de la barbería.';
      
      const toast = await this.toastCtrl.create({
        message: 'Error al guardar los cambios',
        duration: 2000,
        position: 'bottom',
        color: 'danger'
      });
      await toast.present();
    } finally {
      this.savingPerfil = false;
    }
  }
}
