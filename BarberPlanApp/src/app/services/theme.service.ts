import { Injectable, signal } from '@angular/core';

export interface AppTheme {
  id: string;
  name: string;
  className: string;
  colorHex: string;
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  public readonly themes: AppTheme[] = [
    { id: 'gold', name: 'Oro Imperial', className: 'theme-barber', colorHex: '#d4af37' },
    { id: 'sapphire', name: 'Zafiro Real', className: 'theme-sapphire', colorHex: '#3b82f6' },
    { id: 'emerald', name: 'Esmeralda Suizo', className: 'theme-emerald', colorHex: '#10b981' },
    { id: 'crimson', name: 'Carmesí Velvet', className: 'theme-crimson', colorHex: '#ef4444' },
    { id: 'amethyst', name: 'Amatista Noble', className: 'theme-amethyst', colorHex: '#8b5cf6' }
  ];

  public currentTheme = signal<AppTheme>(this.themes[0]);
  public isDarkMode = signal<boolean>(true);

  constructor() {
    this.initTheme();
    this.initMode();
  }

  initTheme() {
    const savedId = localStorage.getItem('barberplan_theme') || 'gold';
    const found = this.themes.find(t => t.id === savedId) || this.themes[0];
    this.setTheme(found, false);
  }

  initMode() {
    const savedMode = localStorage.getItem('barberplan_mode') || 'dark';
    const isDark = savedMode === 'dark';
    this.setMode(isDark, false);
  }

  toggleMode() {
    this.setMode(!this.isDarkMode());
  }

  setMode(isDark: boolean, save = true) {
    this.isDarkMode.set(isDark);
    if (save) {
      localStorage.setItem('barberplan_mode', isDark ? 'dark' : 'light');
    }
    if (isDark) {
      document.body.classList.remove('light-mode');
    } else {
      document.body.classList.add('light-mode');
    }
  }

  setTheme(theme: AppTheme, save = true) {
    this.currentTheme.set(theme);
    if (save) {
      localStorage.setItem('barberplan_theme', theme.id);
    }
    this.themes.forEach(t => {
      if (t.className) {
        document.body.classList.remove(t.className);
      }
    });
    if (theme.className) {
      document.body.classList.add(theme.className);
    }
  }
}
