import { CommonModule } from '@angular/common';
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
  imports: [IonicModule, FormsModule, CommonModule],
})
export class RegisterPage {
  nombre = '';
  apellido = '';
  usuario = '';
  correo = '';
  pw = '';
  confirmPw = '';
  rol = '';
  code = ''; 

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

    const data: any = {
      nombre: this.nombre,
      apellido: this.apellido,
      usuario: this.usuario,
      correo: this.correo,
      pw: this.pw,
      rol: this.rol,
    };

    // Solo añadimos el código si el rol es barbero
    if (this.rol === 'barbero' && this.code.trim() !== '') {
      data.code = this.code;
    }

    try {
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

  goToLogin() {
    this.router.navigateByUrl('/login');
  }

  goToBarberiaRegister(){
    this.router.navigateByUrl('/register-barberia');
  }
}
