import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { ApiService } from '../../../services/api.service';
import { StarRatingComponent } from '../../../components/star-rating/star-rating.component';
import { ReviewImageComponent } from '../../../components/review-image/review-image.component';

@Component({
  selector: 'app-reviews',
  templateUrl: './reviews.page.html',
  styleUrls: ['./reviews.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, StarRatingComponent, ReviewImageComponent]
})
export class ReviewsPage implements OnInit {
  resenas: any[] = [];
  loading = false;
  error = '';
  contentClass = 'admin-premium-content';

  constructor(
    private apiService: ApiService,
    private storage: Storage
  ) { }

  async ngOnInit() {
    await this.storage.create();
    const user = await this.storage.get('user');
    this.contentClass = user?.rol === 'barbero' ? 'barber-premium-content' : 'admin-premium-content';
    await this.loadResenas();
  }

  async loadResenas() {
    this.loading = true;
    this.error = '';
    try {
      const response = await this.apiService.getResenasMiBarberia();
      this.resenas = Array.isArray(response) ? response : [];
    } catch (e) {
      console.error('Error al cargar reseñas', e);
      this.error = 'No se pudieron cargar las reseñas.';
    } finally {
      this.loading = false;
    }
  }

  getClienteNombre(resena: any): string {
    const nombre = resena?.cliente?.nombre || '';
    const apellido = resena?.cliente?.apellido || '';
    // Sin usuario (cuenta eliminada) la reseña conserva solo el nombre anónimo de la cita
    return `${nombre} ${apellido}`.trim() || resena?.clienteNombre || 'Cliente';
  }

  getClienteIniciales(resena: any): string {
    const nombre = (resena?.cliente?.nombre || '').trim();
    const apellido = (resena?.cliente?.apellido || '').trim();
    const iniciales = `${nombre.charAt(0)}${apellido.charAt(0)}`.trim();
    return iniciales.toUpperCase() || (resena?.clienteNombre ? 'CE' : 'CL');
  }

  getBarberoNombre(resena: any): string {
    const nombre = resena?.barbero?.nombre || '';
    const apellido = resena?.barbero?.apellido || '';
    return `${nombre} ${apellido}`.trim();
  }
}
