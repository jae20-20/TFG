import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule, ToastController } from '@ionic/angular';
import { ApiService } from '../../services/api.service';

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
  loadingDisponibilidad = false;
  reservando = false;
  error = '';

  horariosDisponibles: string[] = [];
  minFecha = new Date().toISOString().split('T')[0];

  reservaForm: ReservaForm = {
    servicioId: '',
    barberoId: '',
    fecha: this.minFecha,
    horaInicio: ''
  };

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

      if (this.servicios.length && !this.reservaForm.servicioId) {
        this.reservaForm.servicioId = this.getEntityId(this.servicios[0]);
      }

      if (this.barberos.length && !this.reservaForm.barberoId) {
        this.reservaForm.barberoId = this.getEntityId(this.barberos[0]);
      }

      await this.loadDisponibilidad();
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

  async onBarberoOrFechaChange() {
    this.reservaForm.horaInicio = '';
    await this.loadDisponibilidad();
  }

  async loadDisponibilidad() {
    if (!this.reservaForm.barberoId || !this.reservaForm.fecha || !this.barberiaId) {
      this.horariosDisponibles = [];
      return;
    }

    this.loadingDisponibilidad = true;

    try {
      const response = await this.apiService.getDisponibilidadBarbero(
        this.reservaForm.barberoId,
        this.reservaForm.fecha,
        this.barberiaId
      );

      this.horariosDisponibles = Array.isArray(response?.horariosDisponibles)
        ? response.horariosDisponibles
        : [];
    } catch (error) {
      console.error('Error al cargar disponibilidad:', error);
      this.horariosDisponibles = [];
      const toast = await this.toastCtrl.create({
        message: 'No se pudo cargar la disponibilidad del barbero.',
        duration: 2200,
        position: 'bottom',
        color: 'danger'
      });
      await toast.present();
    } finally {
      this.loadingDisponibilidad = false;
    }
  }

  selectHorario(hora: string) {
    this.reservaForm.horaInicio = hora;
  }

  async reservarCita() {
    if (!this.reservaForm.servicioId || !this.reservaForm.barberoId || !this.reservaForm.fecha || !this.reservaForm.horaInicio) {
      const toast = await this.toastCtrl.create({
        message: 'Completa servicio, barbero, fecha y hora para reservar.',
        duration: 2200,
        position: 'bottom',
        color: 'warning'
      });
      await toast.present();
      return;
    }

    this.reservando = true;

    try {
      await this.apiService.crearCita({
        barberiaId: this.barberiaId,
        barberoId: this.reservaForm.barberoId,
        servicioId: this.reservaForm.servicioId,
        fecha: this.reservaForm.fecha,
        horaInicio: this.reservaForm.horaInicio
      });

      const toast = await this.toastCtrl.create({
        message: 'Cita reservada correctamente.',
        duration: 2200,
        position: 'bottom',
        color: 'success'
      });
      await toast.present();

      this.router.navigateByUrl('/client-home', { replaceUrl: true });
    } catch (error: any) {
      console.error('Error al crear cita:', error);
      const message = error?.error?.error || 'No se pudo reservar la cita.';
      const toast = await this.toastCtrl.create({
        message,
        duration: 2400,
        position: 'bottom',
        color: 'danger'
      });
      await toast.present();
    } finally {
      this.reservando = false;
    }
  }

  goBack() {
    this.router.navigateByUrl('/client-home');
  }
}
