//guard especifico para el rol

import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Storage } from '@ionic/storage-angular';

export const roleGuard = (allowedRole: 'barbero' | 'cliente' | 'admin') => async () => {
  const router = inject(Router);
  const storage = inject(Storage);

  await storage.create();
  const user = await storage.get('user');
  console.log('roleGuard user:', user);

  if (!user) {
    router.navigateByUrl('/login', { replaceUrl: true });
    return false;
  }

  if (user.rol !== allowedRole) {
    // Redirigir al home correspondiente según el rol
    let redirectTo = '/login';
    switch (user.rol) {
      case 'admin':
        redirectTo = '/admin/calendar';
        break;
      case 'barbero':
        redirectTo = '/barber/calendar';
        break;
      case 'cliente':
        redirectTo = '/client-home';
        break;
    }
    router.navigateByUrl(redirectTo, { replaceUrl: true });
    return false;
  }

  return true;
};
