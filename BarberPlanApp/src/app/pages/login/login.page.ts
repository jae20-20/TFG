import { CommonModule } from '@angular/common';
import { Component, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule, ToastController, IonContent } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { ApiService } from '../../services/api.service';
import { vigilarLentitud } from '../../services/arranque-servidor.util';
import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [IonicModule, FormsModule, CommonModule],
})
export class LoginPage {
  @ViewChild(IonContent, { static: false }) content?: IonContent;
  correo: string = '';
  pw: string = '';
  rol: string = '';
  // La API gratuita se duerme sin tráfico: si tarda en responder se avisa de que está despertando
  servidorDespertando = false;
  iniciandoSesion = false;

  constructor(
    private router: Router,
    private authService: AuthService,
    private apiService: ApiService,
    private toastCtrl: ToastController,
    private storage: Storage,
    private themeService: ThemeService
  ) {}

  ionViewWillEnter() {
    this.themeService.applyDefaultPublicTheme();
    this.content?.scrollToTop(0);
    this.despertarServidor();
  }

  // Al abrir el login se pide el estado de la API: despierta la instancia mientras el usuario escribe sus datos
  private despertarServidor() {
    vigilarLentitud(
      () => this.apiService.comprobarEstado(),
      () => { this.servidorDespertando = true; },
      () => { this.servidorDespertando = false; }
    ).catch(() => { /* si falla se verá al iniciar sesión */ });
  }

  async login() {
    if (this.iniciandoSesion) return;
    this.iniciandoSesion = true;
    try {
        const user = await vigilarLentitud(
          () => this.authService.login(this.correo, this.pw),
          () => { this.servidorDespertando = true; },
          () => { this.servidorDespertando = false; }
        );

        await this.storage.create();
        await this.storage.set('user', user);
        this.themeService.loadUserPreferences(user);

        // Redirigir según el rol
          if (user.rol === 'admin') {
            this.router.navigateByUrl('/admin/calendar', { replaceUrl: true });
          } else if (user.rol === 'barbero') {
            this.router.navigateByUrl('/barber/calendar', { replaceUrl: true });
          } else if (user.rol === 'cliente') {
            this.router.navigateByUrl('/client-home', { replaceUrl: true });
        } else {
            const toast = await this.toastCtrl.create({
                message: 'Rol no autorizado.',
                duration: 2000,
                color: 'danger',
            });
            await toast.present();
        }
    } catch (error: any) {
        // 429: demasiados intentos; 503 o sin respuesta: servidor o base de datos no disponibles; otro caso: credenciales
        const sinServicio = error?.status === 0 || error?.status === 503;
        const toast = await this.toastCtrl.create({
            message: error?.status === 429 || error?.status === 503
                ? (error?.error?.error || 'El servicio no está disponible. Inténtalo de nuevo en unos segundos.')
                : sinServicio
                    ? 'No se pudo contactar con el servidor. Inténtalo de nuevo en unos segundos.'
                    : 'Error al iniciar sesión. Verifica tus credenciales.',
            duration: 3000,
            color: 'danger',
        });
        await toast.present();
    } finally {
        this.iniciandoSesion = false;
    }
}

  goToRegister() {
    this.router.navigateByUrl('/register');
  }

  goToBarberiaRegister(){
    this.router.navigateByUrl('/register-barberia');
  }

  goToPrivacidad() {
    this.router.navigateByUrl('/privacidad');
  }
}
