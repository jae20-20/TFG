//guard especifico para el rol

import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Storage } from '@ionic/storage-angular';

export const roleGuard = (allowedRole: 'barbero' | 'cliente') => async () => {
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
    const redirectTo = user.rol === 'barbero' ? '/barber-home' : '/client-home';
    router.navigateByUrl(redirectTo, { replaceUrl: true });
    return false;
  }

  return true;
};
