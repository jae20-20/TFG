import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertController, IonicModule, ToastController } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { addIcons } from 'ionicons';
import { chatbubbleOutline, createOutline, trashOutline } from 'ionicons/icons';
import { ApiService } from '../../../services/api.service';
import { StarRatingComponent } from '../../../components/star-rating/star-rating.component';
import { ReviewImageComponent } from '../../../components/review-image/review-image.component';
import { ReviewReplyComponent } from '../../../components/review-reply/review-reply.component';

addIcons({ 'chatbubble-outline': chatbubbleOutline, 'create-outline': createOutline, 'trash-outline': trashOutline });

// Mismo límite que el servidor (MAX_CARACTERES_RESENA en validateMiddleware.js)
export const MAX_CARACTERES_RESPUESTA = 500;

@Component({
  selector: 'app-reviews',
  templateUrl: './reviews.page.html',
  styleUrls: ['./reviews.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, StarRatingComponent, ReviewImageComponent, ReviewReplyComponent]
})
export class ReviewsPage implements OnInit {
  resenas: any[] = [];
  loading = false;
  error = '';
  contentClass = 'admin-premium-content';

  readonly maxCaracteres = MAX_CARACTERES_RESPUESTA;
  // Reseña (id de la cita) cuyo formulario de respuesta está abierto; solo uno a la vez
  editandoId: string | null = null;
  textoRespuesta = '';
  guardandoRespuesta = false;
  errorRespuesta = '';

  private readonly apiService = inject(ApiService);
  private readonly storage = inject(Storage);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);

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

  // ==================== RESPUESTAS ====================

  // El servidor calcula puedeResponder con las mismas reglas que aplica al guardar; aquí solo se decide qué botón mostrar
  puedeResponder(resena: any): boolean {
    return resena?.puedeResponder === true && !resena?.resena?.respuesta;
  }

  puedeGestionarRespuesta(resena: any): boolean {
    return resena?.puedeResponder === true && Boolean(resena?.resena?.respuesta);
  }

  estaEditando(resena: any): boolean {
    return this.editandoId === resena?._id;
  }

  abrirRespuesta(resena: any) {
    this.editandoId = resena._id;
    this.textoRespuesta = resena?.resena?.respuesta?.texto || '';
    this.errorRespuesta = '';
  }

  cancelarRespuesta() {
    this.editandoId = null;
    this.textoRespuesta = '';
    this.errorRespuesta = '';
  }

  get textoRespuestaValido(): boolean {
    const limpio = this.textoRespuesta.trim();
    return limpio.length > 0 && limpio.length <= this.maxCaracteres;
  }

  async guardarRespuesta(resena: any) {
    if (!this.textoRespuestaValido || this.guardandoRespuesta) return;
    this.guardandoRespuesta = true;
    this.errorRespuesta = '';
    const texto = this.textoRespuesta.trim();
    const editando = Boolean(resena.resena.respuesta);
    try {
      const response = editando
        ? await this.apiService.editarRespuestaResena(resena._id, texto)
        : await this.apiService.responderResena(resena._id, texto);
      resena.resena = { ...resena.resena, respuesta: response.respuesta };
      this.cancelarRespuesta();
      await this.avisar(editando ? 'Respuesta actualizada' : 'Respuesta publicada', 'success');
    } catch (e: any) {
      this.errorRespuesta = e?.error?.error || 'No se pudo guardar la respuesta.';
      // Otra persona respondió o borró la respuesta mientras tanto: se recarga para ver el estado real
      if (e?.status === 404 || e?.status === 409) await this.loadResenas();
    } finally {
      this.guardandoRespuesta = false;
    }
  }

  async confirmarEliminarRespuesta(resena: any) {
    const alerta = await this.alertCtrl.create({
      header: 'Eliminar respuesta',
      message: 'La respuesta dejará de verse en la ficha de la barbería. ¿Quieres eliminarla?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive', handler: () => { this.eliminarRespuesta(resena); } }
      ]
    });
    await alerta.present();
  }

  private async eliminarRespuesta(resena: any) {
    try {
      await this.apiService.eliminarRespuestaResena(resena._id);
      const { respuesta, ...resto } = resena.resena;
      resena.resena = resto;
      if (this.estaEditando(resena)) this.cancelarRespuesta();
      await this.avisar('Respuesta eliminada', 'success');
    } catch (e: any) {
      await this.avisar(e?.error?.error || 'No se pudo eliminar la respuesta.', 'danger');
      await this.loadResenas();
    }
  }

  private async avisar(message: string, color: 'success' | 'danger') {
    const toast = await this.toastCtrl.create({ message, duration: 2000, color, position: 'bottom' });
    await toast.present();
  }
}
