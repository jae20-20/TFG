import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertController, IonicModule, ToastController } from '@ionic/angular';
import { ApiService } from '../../../../services/api.service';

@Component({
  selector: 'app-services',
  templateUrl: './services.page.html',
  styleUrls: ['./services.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class ServicesPage implements OnInit {
  barberia: any = null;
  loading = false;
  newServicioForm = { nombre: '', precio: null as number | null, duracion: null as number | null };
  savingServicio = false;
  deletingServicioId: string | null = null;
  serviciosError = '';

  // Modal "Nuevo servicio"
  isAddModalOpen = false;

  constructor(
    private apiService: ApiService,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController
  ) { }

  ngOnInit() {
    this.loadData();
  }

  async loadData() {
    this.loading = true;
    try {
      this.barberia = await this.apiService.getMyBarberia();
    } catch (error) {
      console.error('Error al cargar la barbería:', error);
      this.serviciosError = 'Error al cargar los servicios.';
    } finally {
      this.loading = false;
    }
  }

  openAddModal() {
    this.newServicioForm = { nombre: '', precio: null, duracion: null };
    this.serviciosError = '';
    this.isAddModalOpen = true;
  }

  closeAddModal() {
    this.isAddModalOpen = false;
  }

  async addServicio() {
    if (!this.barberia?._id) {
      this.serviciosError = 'No se encontró la barbería para añadir el servicio.';
      return;
    }

    if (!this.newServicioForm.nombre || !this.newServicioForm.precio || !this.newServicioForm.duracion) {
      this.serviciosError = 'Nombre, precio y duración son obligatorios.';
      return;
    }

    this.savingServicio = true;
    this.serviciosError = '';

    try {
      await this.apiService.addServicio(this.barberia._id, {
        nombre: this.newServicioForm.nombre,
        precio: Number(this.newServicioForm.precio),
        duracion: Number(this.newServicioForm.duracion)
      });

      this.newServicioForm = { nombre: '', precio: null, duracion: null };
      this.isAddModalOpen = false;
      await this.loadData();

      const toast = await this.toastCtrl.create({
        message: 'Servicio añadido correctamente',
        duration: 2000,
        position: 'bottom',
        color: 'success'
      });
      await toast.present();
    } catch (error) {
      console.error('Error al añadir servicio:', error);
      this.serviciosError = 'No se pudo añadir el servicio.';

      const toast = await this.toastCtrl.create({
        message: 'Error al añadir servicio',
        duration: 2000,
        position: 'bottom',
        color: 'danger'
      });
      await toast.present();
    } finally {
      this.savingServicio = false;
    }
  }

  async confirmDeleteServicio(servicio: any) {
    const alert = await this.alertCtrl.create({
      header: 'Eliminar servicio',
      message: `¿Estás seguro de que deseas eliminar "${servicio.nombre}"?`,
      cssClass: 'premium-alert',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: () => {
            this.deleteServicio(servicio._id);
          }
        }
      ]
    });
    await alert.present();
  }

  async deleteServicio(servicioId: string) {
    if (!this.barberia?._id) return;

    this.deletingServicioId = servicioId;
    try {
      await this.apiService.deleteServicio(this.barberia._id, servicioId);
      await this.loadData();
      
      const toast = await this.toastCtrl.create({
        message: 'Servicio eliminado correctamente',
        duration: 2000,
        position: 'bottom',
        color: 'success'
      });
      await toast.present();
    } catch (error) {
      console.error('Error al eliminar servicio:', error);
      this.serviciosError = 'No se pudo eliminar el servicio.';
      
      const toast = await this.toastCtrl.create({
        message: 'Error al eliminar servicio',
        duration: 2000,
        position: 'bottom',
        color: 'danger'
      });
      await toast.present();
    } finally {
      this.deletingServicioId = null;
    }
  }
}
