import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { AlertController, IonicModule, NavController } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline, calendarOutline, cutOutline, logOutOutline, personOutline, settingsOutline, statsChartOutline } from 'ionicons/icons';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { ThemeHeaderBtnComponent } from '../../../components/theme-header-btn/theme-header-btn.component';
import { AuthService } from '../../../services/auth.service';

addIcons({
  'arrow-back-outline': arrowBackOutline,
  'log-out-outline': logOutOutline,
  'calendar-outline': calendarOutline,
  'settings-outline': settingsOutline,
  'person-outline': personOutline,
  'cut-outline': cutOutline,
  'stats-chart-outline': statsChartOutline
});

@Component({
  selector: 'app-admin-tabs',
  templateUrl: './admin-tabs.page.html',
  styleUrls: ['./admin-tabs.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, ThemeHeaderBtnComponent]
})
export class AdminTabsPage implements OnInit, OnDestroy {
  user: any = null;
  pageName: string = 'Calendario';
  showBackButton: boolean = false;
  backHref: string = '/admin/configuration';
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
    else if (url.includes('analytics')) this.pageName = 'Estadísticas';
    else if (url.includes('barbershop-details')) this.pageName = 'Configuración general barbería';
    else if (url.includes('schedule')) this.pageName = 'Horario';
    else if (url.includes('services')) this.pageName = 'Servicios';
    else if (url.includes('card-configuration')) this.pageName = 'Personalizar';
    else if (url.includes('manage-team')) this.pageName = 'Equipo';
    else if (url.includes('reviews')) this.pageName = 'Reseñas';
    else if (url.includes('configuration')) this.pageName = 'Configuración';
    else if (url.includes('profile')) this.pageName = 'Perfil';
    else this.pageName = 'Admin';
    
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
