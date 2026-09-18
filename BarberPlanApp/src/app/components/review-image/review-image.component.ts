import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';

@Component({
  selector: 'app-review-image',
  standalone: true,
  imports: [CommonModule, IonIcon],
  template: `
    <img [src]="src" class="review-thumb" [style.width.px]="size" [style.height.px]="size" (click)="open()" alt="Foto de la reseña" />

    <div class="review-lightbox" *ngIf="isOpen" (click)="close()">
      <button type="button" class="review-lightbox-close" (click)="close()">
        <ion-icon name="close-outline"></ion-icon>
      </button>
      <img [src]="src" class="review-lightbox-image" (click)="$event.stopPropagation()" alt="Foto de la reseña ampliada" />
    </div>
  `,
  styles: [`
    .review-thumb {
      display: block;
      object-fit: cover;
      border-radius: 10px;
      cursor: zoom-in;
      border: 1px solid var(--custom-border-subtle, rgba(255, 255, 255, 0.12));
      flex-shrink: 0;
    }

    .review-lightbox {
      position: fixed;
      inset: 0;
      z-index: 10000;
      background: rgba(0, 0, 0, 0.85);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      cursor: zoom-out;
    }

    .review-lightbox-image {
      max-width: 90vw;
      max-height: 85vh;
      object-fit: contain;
      border-radius: 12px;
      cursor: default;
    }

    .review-lightbox-close {
      position: fixed;
      top: 18px;
      right: 18px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: none;
      background: rgba(255, 255, 255, 0.12);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;

      ion-icon {
        font-size: 22px;
      }
    }
  `]
})
export class ReviewImageComponent {
  @Input() src: string | null = null;
  @Input() size = 96;
  isOpen = false;

  open() {
    this.isOpen = true;
  }

  close() {
    this.isOpen = false;
  }
}
