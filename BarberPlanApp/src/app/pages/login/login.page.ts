import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule, ToastController } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [IonicModule, FormsModule],
})
export class LoginPage {
  correo: string = '';
  pw: string = '';
  rol: string = '';

  constructor(
    private router: Router,
    private authService: AuthService,
    private toastCtrl: ToastController,
    private storage: Storage
  ) {}

  async login() {
    try {
        const user = await this.authService.login(this.correo, this.pw);
        console.log('Usuario autenticado:', user);

        await this.storage.create();
        await this.storage.set('user', user);

        // Redirigir según el rol
        if (user.rol === 'admin') {
            this.router.navigateByUrl('/admin/calendar', { replaceUrl: true });
        } else if (user.rol === 'barbero') {
            this.router.navigateByUrl('/barber-home', { replaceUrl: true });
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
    } catch (error) {
        const toast = await this.toastCtrl.create({
            message: 'Error al iniciar sesión. Verifica tus credenciales.',
            duration: 2000,
            color: 'danger',
        });
        await toast.present();
    }
}

  goToRegister() {
    this.router.navigateByUrl('/register');
  }

  goToBarberiaRegister(){
    this.router.navigateByUrl('/register-barberia');
  }
}
