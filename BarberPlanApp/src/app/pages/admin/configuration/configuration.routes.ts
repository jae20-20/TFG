import { Routes } from '@angular/router';

export const configurationRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./hub/configuration-hub/configuration-hub.page').then(m => m.ConfigurationHubPage)
  },
  {
    path: 'barbershop-details',
    loadComponent: () => import('./barbershop-details/barbershop-details.page').then(m => m.BarbershopDetailsPage)
  },
  {
    path: 'schedule',
    loadComponent: () => import('./schedule/schedule.page').then(m => m.SchedulePage)
  },
  {
    path: 'services',
    loadComponent: () => import('./services/services.page').then(m => m.ServicesPage)
  },
  {
    path: 'card-configuration',
    loadComponent: () => import('./card-configuration/card-configuration.page').then(m => m.CardConfigurationPage)
  },
  {
    path: 'manage-team',
    loadComponent: () => import('./manage-team/team-list/team-list.page').then(m => m.TeamListPage)
  },
  {
    path: 'manage-team/:id',
    loadComponent: () => import('./manage-team/barber-details/barber-details.page').then(m => m.BarberDetailsPage)
  }
];
