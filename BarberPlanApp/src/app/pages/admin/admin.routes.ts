import { Routes } from '@angular/router';

export const adminRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./admin-tabs/admin-tabs.page').then(m => m.AdminTabsPage),
    children: [
      {
        path: 'calendar',
        loadComponent: () => import('./calendar/calendar.page').then(m => m.CalendarPage)
      },
      {
        path: 'analytics',
        loadComponent: () => import('./analytics/analytics.page').then(m => m.AnalyticsPage)
      },
      {
        path: 'configuration',
        loadChildren: () => import('./configuration/configuration.routes').then(m => m.configurationRoutes)
      },
      {
        path: 'profile',
        loadComponent: () => import('./profile/profile.page').then(m => m.ProfilePage)
      },
      {
        path: '',
        redirectTo: 'calendar',
        pathMatch: 'full'
      }
    ]
  }
];
