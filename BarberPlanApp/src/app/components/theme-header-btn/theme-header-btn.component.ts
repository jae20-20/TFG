import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonButton, IonIcon, ActionSheetController } from '@ionic/angular/standalone';
import { ThemeService, AppTheme } from '../../services/theme.service';

@Component({
  selector: 'app-theme-header-btn',
  standalone: true,
  imports: [CommonModule, IonButton, IonIcon],
  template: `
    <ion-button fill="clear" class="theme-palette-btn" (click)="openThemeSelector()" title="Cambiar paleta de color">
      <ion-icon slot="icon-only" name="color-palette-outline"></ion-icon>
    </ion-button>
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
  `]
})
export class ThemeHeaderBtnComponent {
  constructor(
    private themeService: ThemeService,
    private actionSheetCtrl: ActionSheetController
  ) {}

  async openThemeSelector() {
    const currentId = this.themeService.currentTheme().id;
    const isDark = this.themeService.isDarkMode();

    const modeButton = {
      text: isDark ? '☀️  Cambiar a Modo Claro' : '🌙  Cambiar a Modo Oscuro',
      handler: () => {
        this.themeService.toggleMode();
      }
    };

    const themeButtons = this.themeService.themes.map((theme: AppTheme) => ({
      text: `${theme.name} ${theme.id === currentId ? '✓' : ''}`,
      role: theme.id === currentId ? 'selected' : undefined,
      handler: () => {
        this.themeService.setTheme(theme);
      }
    }));

    const buttons: any[] = [
      modeButton,
      ...themeButtons,
      {
        text: 'Cancelar',
        role: 'cancel',
        handler: () => {}
      }
    ];

    const actionSheet = await this.actionSheetCtrl.create({
      header: 'Personalización Visual',
      subHeader: 'Elige el modo de iluminación y la paleta de color',
      buttons: buttons,
      cssClass: 'premium-action-sheet'
    });

    await actionSheet.present();
  }
}
