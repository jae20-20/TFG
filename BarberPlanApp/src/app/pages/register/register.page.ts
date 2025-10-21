import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule, ToastController } from '@ionic/angular';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  standalone: true,
  imports: [IonicModule, FormsModule],
})
export class RegisterPage {
  nombre: string = '';
  apellido: string = '';
  usuario: string = '';
  correo: string = '';
  pw: string = '';
  confirmPw: string = '';
  rol: string = '';

  constructor(
    private authService: AuthService,
    private router: Router,
    private toastCtrl: ToastController
  ) {}

  async register() {
    if (this.pw !== this.confirmPw) {
      const toast = await this.toastCtrl.create({
        message: 'Las contraseñas no coinciden.',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
      return;
    }

    try {
      const data = {
        nombre: this.nombre,
        apellido: this.apellido,
        usuario: this.usuario,
        correo: this.correo,
        pw: this.pw,
        rol: this.rol,
      };
      await this.authService.register(data);
      const toast = await this.toastCtrl.create({
        message: 'Cuenta creada con éxito.',
        duration: 2000,
        color: 'success',
      });
      await toast.present();
      this.router.navigateByUrl('/login');
    } catch (error) {
      const toast = await this.toastCtrl.create({
        message: 'Error al crear la cuenta. Inténtalo de nuevo.',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    }
  }
}