import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { roleGuard } from './guards/role.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', loadComponent: () => import('./pages/login/login.page').then(m => m.LoginPage) },
  { path: 'register', loadComponent: () => import('./pages/register/register.page').then(m => m.RegisterPage) },
  { 
    path: 'register-barberia', 
    loadComponent: () => import('./pages/register-barberia/register-barberia.page').then(m => m.RegisterBarberiaPage) 
  },
  {
    path: 'admin',
    loadChildren: () => import('./pages/admin/admin.routes').then(m => m.adminRoutes),
    canActivate: [authGuard, roleGuard('admin')]
  },
  {
    path: 'barber-home',
    loadComponent: () => import('./pages/barber-home/barber-home.page').then(m => m.BarberHomePage),
    canActivate: [authGuard, roleGuard('barbero')]
  },
  {
    path: 'client-home',
    loadComponent: () => import('./pages/client/home/client-home.page').then(m => m.ClientHomePage),
    canActivate: [authGuard, roleGuard('cliente')]
  },
  {
    path: 'client-appointments',
    loadComponent: () => import('./pages/client/appointments/client-appointments.page').then(m => m.ClientAppointmentsPage),
    canActivate: [authGuard, roleGuard('cliente')]
  },
  {
    path: 'client-profile',
    loadComponent: () => import('./pages/client/profile/client-profile.page').then(m => m.ClientProfilePage),
    canActivate: [authGuard, roleGuard('cliente')]
  },
  {
    path: 'client-home/barberia/:id',
    loadComponent: () => import('./pages/client/barberia-detail/client-barberia-detail.page').then(m => m.ClientBarberiaDetailPage),
    canActivate: [authGuard, roleGuard('cliente')]
  },
  {
    path: 'client-home/barberia/:id/reservar',
    loadComponent: () => import('./pages/client/barberia-booking/client-barberia-booking.page').then(m => m.ClientBarberiaBookingPage),
    canActivate: [authGuard, roleGuard('cliente')]
  },];
