import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IonicModule, ToastController } from '@ionic/angular';
import { ApiService } from '../../../../../services/api.service';

interface BarberDetail {
  _id: string;
  nombre: string;
  apellido: string;
  telefono: string;
  vacaciones: string[]; // ISO date strings
  horarioPersonal: any; // could be similar to schedule
}

@Component({
  selector: 'app-barber-details',
  templateUrl: './barber-details.page.html',
  styleUrls: ['./barber-details.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class BarberDetailsPage implements OnInit {
  barberId: string | null = null;
  barber: BarberDetail | null = null;
  loading = false;
  error = '';
  saving = false;

  constructor(
    private route: ActivatedRoute,
    private apiService: ApiService,
    private toastCtrl: ToastController
  ) {}

  ngOnInit() {
    this.barberId = this.route.snapshot.paramMap.get('id');
    if (this.barberId) {
      this.loadBarberDetail();
    } else {
      this.error = 'ID de barbero no disponible.';
    }
  }

  async loadBarberDetail() {
    this.loading = true;
    try {
      this.barber = await this.apiService.getBarberoById(this.barberId!);
    } catch (e) {
      console.error('Error cargando detalle de barbero', e);
      this.error = 'No se pudo cargar la información del barbero.';
    } finally {
      this.loading = false;
    }
  }

  async saveBarberDetail() {
    if (!this.barber) return;
    this.saving = true;
    try {
      await this.apiService.updateBarbero(this.barber._id, this.barber);
      const toast = await this.toastCtrl.create({
        message: 'Datos del barbero actualizados',
        duration: 2000,
        position: 'bottom',
        color: 'success'
      });
      await toast.present();
    } catch (e) {
      console.error('Error guardando barbero', e);
      const toast = await this.toastCtrl.create({
        message: 'Error al guardar los cambios',
        duration: 2000,
        position: 'bottom',
        color: 'danger'
      });
      await toast.present();
    } finally {
      this.saving = false;
    }
  }
}
