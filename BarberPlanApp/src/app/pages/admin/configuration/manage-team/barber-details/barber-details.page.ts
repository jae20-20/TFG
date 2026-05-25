import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, IonicModule, ToastController } from '@ionic/angular';
import { ApiService } from '../../../../../services/api.service';

interface BarberDetail {
  _id: string;
  nombre: string;
  apellido: string;
  telefono: string;
  correo: string;
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
    private router: Router,
    private apiService: ApiService,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController
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

  async confirmRemoveBarber() {
    const alert = await this.alertCtrl.create({
      header: 'Confirmar eliminación',
      message: `¿Estás seguro de que deseas eliminar a ${this.barber?.nombre} ${this.barber?.apellido} de la barbería?`,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: () => {
            this.removeBarber();
          }
        }
      ]
    });

    await alert.present();
  }

  async removeBarber() {
    if (!this.barber) return;
    this.saving = true;
    try {
      // 1. Obtener la barbería asociada al admin
      const miBarberia = await this.apiService.getMyBarberia();
      // 2. Eliminar el barbero
      await this.apiService.removeBarbero(miBarberia._id, this.barber._id);
      
      const toast = await this.toastCtrl.create({
        message: 'Barbero eliminado de la barbería con éxito.',
        duration: 2000,
        position: 'bottom',
        color: 'success'
      });
      await toast.present();
      
      // Volver a la lista de barberos
      this.router.navigate(['/admin/configuration'], { replaceUrl: true });
    } catch (e) {
      console.error('Error eliminando barbero', e);
      const toast = await this.toastCtrl.create({
        message: 'Error al eliminar al barbero.',
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
