import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonButton,
  IonIcon,
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonFooter,
  IonToggle
} from '@ionic/angular/standalone';
import { ThemeService, AppTheme } from '../../services/theme.service';

@Component({
  selector: 'app-theme-header-btn',
  standalone: true,
  imports: [
    CommonModule,
    IonButton,
    IonIcon,
    IonModal,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonFooter,
    IonToggle
  ],
  template: `
    <ion-button fill="clear" class="theme-palette-btn" (click)="openThemeModal()" title="Personalización Visual">
      <ion-icon slot="icon-only" name="color-palette-outline"></ion-icon>
    </ion-button>

    <ion-modal [isOpen]="isModalOpen" (didDismiss)="onModalDismiss()" class="premium-modal compact-modal">
      <ng-template>
        <ion-header>
          <ion-toolbar>
            <ion-title>Personalización</ion-title>
            <ion-buttons slot="end">
              <ion-button (click)="cancelModal()" style="color: #ef4444 !important; font-weight: 700 !important;">Cancelar</ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <div class="compact-modal-body">
          <!-- Toggle Modo Oscuro / Claro -->
          <div class="mode-card mb-5 p-4 rounded-2xl border transition">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <ion-icon [name]="tempIsDark ? 'moon' : 'sunny'" class="text-2xl text-gold-400"></ion-icon>
                <div>
                  <div class="font-bold text-dynamic-text text-base">Modo Oscuro</div>
                  <div class="text-xs text-dynamic-muted">{{ tempIsDark ? 'Activado' : 'Desactivado (Modo Claro)' }}</div>
                </div>
              </div>
              <ion-toggle [checked]="tempIsDark" (ionChange)="onToggleDark($event)"></ion-toggle>
            </div>
          </div>

          <!-- Selección de Paleta de Color -->
          <div class="text-xs font-bold uppercase tracking-wider text-dynamic-muted mb-3 px-1">Paleta de Color</div>
          <div class="grid grid-cols-1 gap-2.5">
            <div
              *ngFor="let theme of themes"
              (click)="selectTempTheme(theme)"
              class="palette-item cursor-pointer flex items-center justify-between p-3.5 rounded-xl border transition"
              [class.palette-item-active]="tempTheme?.id === theme.id"
            >
              <div class="flex items-center gap-3">
                <span class="color-dot" [style.background]="theme.colorHex"></span>
                <span class="font-semibold text-dynamic-text">{{ theme.name }}</span>
              </div>
              <ion-icon *ngIf="tempTheme?.id === theme.id" name="checkmark-circle" class="text-xl text-gold-400"></ion-icon>
            </div>
          </div>
        </div>
        <ion-footer>
          <ion-toolbar>
            <ion-button expand="block" class="premium-modal-button-solid ion-margin" style="--color: #ffffff !important; color: #ffffff !important; font-weight: 800 !important;" (click)="saveModal()">
              Guardar
            </ion-button>
          </ion-toolbar>
        </ion-footer>
      </ng-template>
    </ion-modal>
  `,
  styles: [`
    .theme-palette-btn {
      --color: var(--custom-text-primary);
      color: var(--custom-text-primary);
      margin-right: 2px;
      --border-radius: 8px;
      transition: transform 0.2s ease;
    }
    .theme-palette-btn:hover {
      transform: scale(1.08);
    }

    .mode-card {
      background: var(--custom-surface);
      border-color: var(--custom-border-subtle);
    }

    .palette-item {
      background: var(--custom-surface);
      border-color: var(--custom-border-subtle);
    }

    .palette-item:hover {
      filter: brightness(1.1);
    }

    .palette-item-active {
      border-color: var(--ion-color-primary) !important;
      background: rgba(var(--ion-color-primary-rgb, 212, 175, 55), 0.12) !important;
    }

    .color-dot {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      display: inline-block;
      border: 2px solid rgba(255, 255, 255, 0.25);
    }
  `]
})
export class ThemeHeaderBtnComponent {
  isModalOpen = false;
  themes: AppTheme[] = [];
  tempTheme: AppTheme | null = null;
  tempIsDark = true;

  private originalTheme: AppTheme | null = null;
  private originalIsDark = true;
  private isSaved = false;

  constructor(private themeService: ThemeService, private cdr: ChangeDetectorRef) {
    this.themes = this.themeService.themes;
  }

  openThemeModal() {
    this.originalTheme = this.themeService.currentTheme();
    this.originalIsDark = this.themeService.isDarkMode();

    this.tempTheme = this.originalTheme;
    this.tempIsDark = this.originalIsDark;
    this.isSaved = false;

    this.isModalOpen = true;
    this.cdr.detectChanges();
  }

  onToggleDark(event: any) {
    this.tempIsDark = event.detail.checked;
    this.themeService.setMode(this.tempIsDark, false);
    this.cdr.detectChanges();
  }

  selectTempTheme(theme: AppTheme) {
    this.tempTheme = theme;
    this.themeService.setTheme(theme, false);
    this.cdr.detectChanges();
  }

  saveModal() {
    this.isSaved = true;
    if (this.tempTheme) {
      this.themeService.setTheme(this.tempTheme, true);
    }
    this.themeService.setMode(this.tempIsDark, true);
    this.isModalOpen = false;
    this.cdr.detectChanges();
  }

  cancelModal() {
    this.isSaved = false;
    this.isModalOpen = false;
    this.cdr.detectChanges();
  }

  onModalDismiss() {
    if (!this.isSaved) {
      if (this.originalTheme) {
        this.themeService.setTheme(this.originalTheme, false);
      }
      this.themeService.setMode(this.originalIsDark, false);
    }
    this.isModalOpen = false;
    this.cdr.detectChanges();
  }
}
