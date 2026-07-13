import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AlertController, IonicModule, ToastController, IonContent } from '@ionic/angular';
import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-register-barberia',
  templateUrl: './register-barberia.page.html',
  styleUrls: ['./register-barberia.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, RouterLink]
})
export class RegisterBarberiaPage implements OnInit {
  @ViewChild(IonContent, { static: false }) content?: IonContent;
  currentStep = 1;
  isLoading = false;
  showPassword = false;
  confirmPw = '';

  ciudades = [
    'Madrid',
    'Valencia',
    'Sevilla'
  ];

  formData = {
    // Datos de la barbería
    nombreBarberia: '',
    ciudad: '',
    direccion: '',
    telefono: '',
    descripcion: '',
    // Datos del admin
    nombre: '',
    apellido: '',
    usuario: '',
    correo: '',
    pw: ''
  };

  constructor(
    private authService: AuthService,
    private router: Router,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private themeService: ThemeService
  ) {}

  ngOnInit() {}

  ionViewWillEnter() {
    this.themeService.applyDefaultPublicTheme();
    this.content?.scrollToTop(0);
  }

  // Validación del paso 1
  isStep1Valid(): boolean {
    return !!(this.formData.nombreBarberia.trim() && this.formData.ciudad && this.formData.direccion.trim());
  }

  // Validación del paso 2
  isStep2Valid(): boolean {
    return !!(
      this.formData.nombre.trim() &&
      this.formData.apellido.trim() &&
      this.formData.usuario.trim() &&
      this.formData.correo.trim() &&
      this.formData.pw.trim() &&
      this.confirmPw.trim() &&
      this.formData.pw === this.confirmPw
    );
  }

  nextStep() {
    if (this.isStep1Valid()) {
      this.currentStep = 2;
    }
  }

  prevStep() {
    this.currentStep = 1;
  }

  async onSubmit() {
    // Validar contraseñas
    if (this.formData.pw !== this.confirmPw) {
      await this.showToast('Las contraseñas no coinciden', 'danger');
      return;
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.formData.correo)) {
      await this.showToast('El correo electrónico no es válido', 'danger');
      return;
    }

    this.isLoading = true;

    try {
      const response = await this.authService.registerBarberia(this.formData);

      // Mostrar el código de la barbería
      const alert = await this.alertCtrl.create({
        header: '¡Barbería Registrada!',
        subHeader: `Código: ${response.barberia.codigo}`,
        message: 'Guarda este código y compártelo con tus barberos para que puedan registrarse en tu barbería.',
        cssClass: 'premium-alert codigo-alert',
        buttons: [
          {
            text: 'Entendido',
            handler: () => {
              this.router.navigateByUrl('/admin-home');
            }
          }
        ],
        backdropDismiss: false
      });

      await alert.present();

    } catch (error: any) {
      console.error('Error en registro:', error);
      const message = error?.error?.error || 'Error al registrar la barbería';
      await this.showToast(message, 'danger');
    } finally {
      this.isLoading = false;
    }
  }

  private async showToast(message: string, color: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      color,
      position: 'bottom'
    });
    await toast.present();
  }
}
