//guard que comprueba si hay token (logeado) sino lo manda al login
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Storage } from '@ionic/storage-angular';

export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const storage = inject(Storage);

  // Espera a que se cree la DB antes de leer
  await storage.create();

  const user = await storage.get('user');
  if (!user) {
    router.navigateByUrl('/login', { replaceUrl: true });
    return false;
  }

  return true;
};

