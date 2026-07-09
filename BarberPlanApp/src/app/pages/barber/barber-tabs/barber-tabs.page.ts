import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, NavigationEnd } from '@angular/router';
import { AlertController, IonicModule, NavController } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { AuthService } from '../../../services/auth.service';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { ThemeHeaderBtnComponent } from '../../../components/theme-header-btn/theme-header-btn.component';
import { addIcons } from 'ionicons';
import { arrowBackOutline, logOutOutline, calendarOutline, settingsOutline, personOutline, cutOutline } from 'ionicons/icons';

addIcons({
  'arrow-back-outline': arrowBackOutline,
  'log-out-outline': logOutOutline,
  'calendar-outline': calendarOutline,
  'settings-outline': settingsOutline,
  'person-outline': personOutline,
  'cut-outline': cutOutline
});

@Component({
  selector: 'app-barber-tabs',
  templateUrl: './barber-tabs.page.html',
  styleUrls: ['./barber-tabs.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, ThemeHeaderBtnComponent]
})
export class BarberTabsPage implements OnInit, OnDestroy {
  user: any = null;
  pageName: string = 'Calendario';
  showBackButton: boolean = false;
  backHref: string = '/barber/configuration';
  private routerSub: Subscription;

  constructor(
    private authService: AuthService,
    private storage: Storage,
    private router: Router,
    private alertCtrl: AlertController,
    private navCtrl: NavController,
    private cdr: ChangeDetectorRef
  ) {
    this.routerSub = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.updatePageName(event.urlAfterRedirects);
    });
  }

  ngOnInit() {
    this.storage.create().then(() => {
      this.storage.get('user').then(u => this.user = u);
    });
    this.updatePageName(this.router.url);
  }

  ngOnDestroy() {
    if (this.routerSub) {
      this.routerSub.unsubscribe();
    }
  }

  updatePageName(url: string) {
    const segments = url.split('?')[0].split('/').filter(s => s);
    this.showBackButton = segments.length > 2;

    if (this.showBackButton) {
      this.backHref = '/' + segments.slice(0, 2).join('/');
    }

    if (url.includes('calendar')) this.pageName = 'Calendario';
    else if (url.includes('barbershop-details')) this.pageName = 'Datos Barbería';
    else if (url.includes('solicitudes')) this.pageName = 'Solicitudes';
    else if (url.includes('catalogo-servicios')) this.pageName = 'Catálogo';
    else if (url.includes('configuration')) this.pageName = 'Configuración';
    else if (url.includes('profile')) this.pageName = 'Perfil';
    else this.pageName = 'Barbero';
    
    this.cdr.detectChanges();
  }

  goBack() {
    this.navCtrl.navigateBack(this.backHref);
  }

  async logout() {
    const alert = await this.alertCtrl.create({
      header: 'Cerrar Sesión',
      message: '¿Estás seguro de que quieres cerrar sesión?',
      cssClass: 'premium-alert',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Cerrar Sesión',
          handler: async () => {
            await this.authService.logout();
            await this.storage.remove('user');
            this.router.navigateByUrl('/login', { replaceUrl: true });
          }
        }
      ]
    });
    await alert.present();
  }
}
