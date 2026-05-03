import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule, ToastController } from '@ionic/angular';
import { ApiService } from '../../../services/api.service';

interface ReservaForm {
  servicioId: string;
  barberoId: string;
  fecha: string;
  horaInicio: string;
}

@Component({
  selector: 'app-client-barberia-detail',
  templateUrl: './client-barberia-detail.page.html',
  styleUrls: ['./client-barberia-detail.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class ClientBarberiaDetailPage implements OnInit {
  barberiaId = '';
  barberia: any = null;
  servicios: any[] = [];
  barberos: any[] = [];

  loading = false;
  error = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private apiService: ApiService,
    private toastCtrl: ToastController
  ) {}

  async ngOnInit() {
    this.barberiaId = this.route.snapshot.paramMap.get('id') || '';

    if (!this.barberiaId) {
      this.error = 'No se ha encontrado la barbería.';
      return;
    }

    await this.loadBarberiaDetail();
  }

  async loadBarberiaDetail() {
    this.loading = true;
    this.error = '';

    try {
      const [barberia, servicios, barberos] = await Promise.all([
        this.apiService.getBarberia(this.barberiaId),
        this.apiService.getServiciosBarberia(this.barberiaId),
        this.apiService.getBarberosBarberia(this.barberiaId)
      ]);

      this.barberia = barberia;
      this.servicios = Array.isArray(servicios) ? servicios : [];
      this.barberos = Array.isArray(barberos) ? barberos : [];
    } catch (error) {
      console.error('Error al cargar detalle de barbería:', error);
      this.error = 'No se pudo cargar el detalle de la barbería.';
    } finally {
      this.loading = false;
    }
  }

  getEntityId(entity: any): string {
    return entity?._id || entity?.id || '';
  }

  getCoverImage() {
    return this.barberia?.portadaUrl || this.barberia?.imagen || '';
  }

  getLogoImage() {
    return this.barberia?.logoUrl || '';
  }

  getBarberoNombre(barbero: any) {
    return [barbero?.nombre, barbero?.apellido].filter(Boolean).join(' ') || barbero?.usuario || 'Barbero';
  }

  getServicioPrecio(servicio: any) {
    const precio = Number(servicio?.precio);
    if (!Number.isFinite(precio)) {
      return '-';
    }

    return `${precio.toFixed(2)} EUR`;
  }

  goToBooking() {
    if (!this.barberiaId) {
      return;
    }

    this.router.navigate(['/client-home/barberia', this.barberiaId, 'reservar']);
  }

  goBack() {
    this.router.navigateByUrl('/client-home');
  }
}
