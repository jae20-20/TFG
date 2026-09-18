import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';

@Component({
  selector: 'app-star-rating',
  standalone: true,
  imports: [CommonModule, IonIcon],
  template: `
    <div class="star-rating" [class.readonly]="readonly" [style.--star-size.px]="size">
      <ion-icon
        *ngFor="let star of stars"
        [name]="star <= value ? 'star' : 'star-outline'"
        [class.filled]="star <= value"
        (click)="onStarClick(star)"
      ></ion-icon>
    </div>
  `,
  styles: [`
    .star-rating {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }

    .star-rating ion-icon {
      font-size: var(--star-size, 22px);
      color: var(--custom-border-subtle);
      transition: transform 0.15s ease, color 0.15s ease;
    }

    .star-rating ion-icon.filled {
      color: #f5b400;
    }

    .star-rating:not(.readonly) ion-icon {
      cursor: pointer;
    }

    .star-rating:not(.readonly) ion-icon:hover {
      transform: scale(1.15);
    }
  `]
})
export class StarRatingComponent {
  @Input() value = 0;
  @Input() readonly = false;
  @Input() size = 22;
  @Output() valueChange = new EventEmitter<number>();

  stars = [1, 2, 3, 4, 5];

  onStarClick(star: number) {
    if (this.readonly) {
      return;
    }
    this.value = star;
    this.valueChange.emit(star);
  }
}
