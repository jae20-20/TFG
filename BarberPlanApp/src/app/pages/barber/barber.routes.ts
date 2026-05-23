import { Routes } from '@angular/router';

export const barberRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./barber-tabs/barber-tabs.page').then(m => m.BarberTabsPage),
    children: [
      {
        path: 'calendar',
        loadComponent: () => import('./calendar/calendar.page').then(m => m.BarberCalendarPage)
      },
      {
        path: 'configuration',
        loadChildren: () => import('./configuration/configuration.routes').then(m => m.configurationRoutes)
      },
      {
        path: 'profile',
        loadComponent: () => import('./profile/profile.page').then(m => m.BarberProfilePage)
      },
      {
        path: '',
        redirectTo: 'calendar',
        pathMatch: 'full'
      }
    ]
  }
];
