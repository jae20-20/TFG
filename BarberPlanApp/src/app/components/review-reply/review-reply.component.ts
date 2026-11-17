import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chatbubbleEllipsesOutline } from 'ionicons/icons';

addIcons({ 'chatbubble-ellipses-outline': chatbubbleEllipsesOutline });

// Respuesta del personal a una reseña, tal como la envía la API (sin el id del autor)
export interface RespuestaResena {
  texto: string;
  autorRol: 'admin' | 'barbero';
  createdAt: string;
  updatedAt?: string | null;
}

interface NombrePersona {
  nombre?: string;
  apellido?: string;
}

// Quién firma la respuesta: la barbería si la escribió el dueño; si fue el barbero, su nombre
// (el barbero que responde es siempre el que atendió la cita, así que basta con el barbero de la reseña)
export function autorRespuestaResena(respuesta: RespuestaResena | null | undefined, barbero?: NombrePersona | null): string {
  if (respuesta?.autorRol !== 'barbero') return 'Respuesta de la barbería';
  const nombre = `${barbero?.nombre || ''} ${barbero?.apellido || ''}`.trim();
  return nombre ? `Respuesta de ${nombre}` : 'Respuesta del barbero';
}

@Component({
  selector: 'app-review-reply',
  standalone: true,
  imports: [CommonModule, IonIcon],
  template: `
    <div class="review-reply" *ngIf="respuesta?.texto">
      <p class="review-reply-autor">
        <ion-icon name="chatbubble-ellipses-outline" aria-hidden="true"></ion-icon>
        <span>{{ autor }}</span>
        <span class="review-reply-fecha">
          · {{ respuesta!.createdAt | date:'dd/MM/yyyy' }}<ng-container *ngIf="respuesta!.updatedAt"> (editada)</ng-container>
        </span>
      </p>
      <p class="review-reply-texto">{{ respuesta!.texto }}</p>
    </div>
  `,
  styles: [`
    .review-reply {
      margin-top: 10px;
      padding: 10px 12px;
      border-left: 3px solid var(--ion-color-primary);
      border-radius: var(--bp-radius-sm, 8px);
      background: rgba(var(--ion-color-primary-rgb), 0.1);
    }

    .review-reply-autor {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      margin: 0 0 4px;
      color: var(--ion-color-primary);
      font-size: 0.8rem;
      font-weight: 700;

      ion-icon {
        font-size: 15px;
      }
    }

    .review-reply-fecha {
      color: var(--custom-text-muted);
      font-weight: 500;
    }

    .review-reply-texto {
      margin: 0;
      color: var(--custom-text-primary);
      font-size: 0.9rem;
      line-height: 1.4;
      white-space: pre-line;
      overflow-wrap: anywhere;
    }
  `]
})
export class ReviewReplyComponent {
  @Input() respuesta: RespuestaResena | null | undefined = null;
  @Input() barbero: NombrePersona | null | undefined = null;

  get autor(): string {
    return autorRespuestaResena(this.respuesta, this.barbero);
  }
}
