import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Storage } from '@ionic/storage-angular';
import { ThemeService } from '../services/theme.service';

export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const storage = inject(Storage);
  const themeService = inject(ThemeService);

  // Espera a que se cree la DB antes de leer
  await storage.create();

  const user = await storage.get('user');
  if (!user) {
    router.navigateByUrl('/login', { replaceUrl: true });
    return false;
  }

  themeService.loadUserPreferences(user);
  return true;
};

