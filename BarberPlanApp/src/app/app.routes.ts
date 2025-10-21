import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { roleGuard } from './guards/role.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', loadComponent: () => import('./pages/login/login.page').then(m => m.LoginPage) },
  { path: 'register', loadComponent: () => import('./pages/register/register.page').then(m => m.RegisterPage) },
  {
    path: 'barber-home',
    loadComponent: () => import('./pages/barber-home/barber-home.page').then(m => m.BarberHomePage),
    canActivate: [authGuard, roleGuard('barbero')]
  },
  {
    path: 'client-home',
    loadComponent: () => import('./pages/client-home/client-home.page').then(m => m.ClientHomePage),
    canActivate: [authGuard, roleGuard('cliente')]
  },
];
