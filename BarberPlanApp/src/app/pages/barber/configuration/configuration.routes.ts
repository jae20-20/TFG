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
    path: 'catalogo-servicios',
    loadComponent: () => import('./catalogo-servicios/catalogo-servicios.page').then(m => m.CatalogoServiciosPage)
  },
  {
    path: 'solicitudes',
    loadComponent: () => import('./solicitudes/solicitudes.page').then(m => m.SolicitudesPage)
  },
  {
    path: 'schedule',
    loadComponent: () => import('./schedule/schedule.page').then(m => m.SchedulePage)
  }
];
