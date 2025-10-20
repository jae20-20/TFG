import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule, ToastController } from '@ionic/angular';
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

  constructor(private router: Router, private authService: AuthService, private toastCtrl: ToastController) {}

  async login() {
    try {
      const user = await this.authService.login(this.correo, this.pw);
      console.log('Usuario autenticado:', user);
      this.router.navigateByUrl('/home', { replaceUrl: true });
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
}