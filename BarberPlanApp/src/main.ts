import { provideHttpClient } from '@angular/common/http';
import { bootstrapApplication } from '@angular/platform-browser';
import { PreloadAllModules, RouteReuseStrategy, provideRouter, withPreloading } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { defineCustomElements } from '@ionic/core/loader';
import { Storage } from '@ionic/storage-angular';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';

// Las páginas importan IonicModule (@ionic/angular), que necesita los web components registrados de forma
// perezosa. provideIonicAngular (standalone) no lo hace, y el build de producción elimina el registro implícito.
// ion-tabs se excluye (como hace IonicModule.forRoot): lo implementa el IonTabs de Angular y, si se registra también
// como web component, su contenedor interno queda con altura 0 y los elementos "fixed" (botones +) salen de pantalla
defineCustomElements(window, { exclude: ['ion-tabs'] });

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient(),
    Storage
  ],
});  
