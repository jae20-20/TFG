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
  private currentUserKey: string | null = null;

  constructor() {
    this.currentUserKey = localStorage.getItem('barberplan_active_user_key') || null;
    this.initTheme();
    this.initMode();
  }

  getUserKey(user: any): string | null {
    if (!user) return null;
    const rawId = user.id || user._id || user.correo || user.email || user.usuario || '';
    return String(rawId).trim() || null;
  }

  loadUserPreferences(user: any) {
    const userKey = this.getUserKey(user);
    this.currentUserKey = userKey;

    if (userKey) {
      localStorage.setItem('barberplan_active_user_key', userKey);
    }

    const savedId = userKey ? localStorage.getItem(`barberplan_theme_${userKey}`) : null;
    const themeIdToApply = savedId || 'gold';
    const foundTheme = this.themes.find(t => t.id === themeIdToApply) || this.themes[0];
    this.setTheme(foundTheme, false);

    const savedMode = userKey ? localStorage.getItem(`barberplan_mode_${userKey}`) : null;
    const isDark = (savedMode || 'dark') === 'dark';
    this.setMode(isDark, false);
  }

  clearUserPreferences() {
    localStorage.removeItem('barberplan_active_user_key');
    this.currentUserKey = null;
    this.setTheme(this.themes[0], false);
    this.setMode(true, false);
  }

  initTheme() {
    const savedId = this.currentUserKey
      ? (localStorage.getItem(`barberplan_theme_${this.currentUserKey}`) || localStorage.getItem('barberplan_theme') || 'gold')
      : (localStorage.getItem('barberplan_theme') || 'gold');

    const found = this.themes.find(t => t.id === savedId) || this.themes[0];
    this.setTheme(found, false);
  }

  initMode() {
    const savedMode = this.currentUserKey
      ? (localStorage.getItem(`barberplan_mode_${this.currentUserKey}`) || localStorage.getItem('barberplan_mode') || 'dark')
      : (localStorage.getItem('barberplan_mode') || 'dark');

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
      if (this.currentUserKey) {
        localStorage.setItem(`barberplan_mode_${this.currentUserKey}`, isDark ? 'dark' : 'light');
      }
    }
    if (isDark) {
      document.documentElement.classList.remove('light-mode');
      document.body.classList.remove('light-mode');
    } else {
      document.documentElement.classList.add('light-mode');
      document.body.classList.add('light-mode');
    }
    void document.documentElement.offsetHeight;
  }

  setTheme(theme: AppTheme, save = true) {
    this.currentTheme.set(theme);
    if (save) {
      localStorage.setItem('barberplan_theme', theme.id);
      if (this.currentUserKey) {
        localStorage.setItem(`barberplan_theme_${this.currentUserKey}`, theme.id);
      }
    }
    this.themes.forEach(t => {
      if (t.className) {
        document.documentElement.classList.remove(t.className);
        document.body.classList.remove(t.className);
      }
    });
    if (theme.className) {
      document.documentElement.classList.add(theme.className);
      document.body.classList.add(theme.className);
    }
    void document.documentElement.offsetHeight;
  }
}
