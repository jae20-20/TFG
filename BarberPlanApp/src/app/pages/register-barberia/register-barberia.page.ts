import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AlertController, IonicModule, ToastController, IonContent } from '@ionic/angular';
import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../services/theme.service';
import { validarCorreo, validarPasswordNueva } from '../../services/validacion-credenciales.util';
import { PhoneInputComponent } from '../../components/phone-input/phone-input.component';

@Component({
  selector: 'app-register-barberia',
  templateUrl: './register-barberia.page.html',
  styleUrls: ['./register-barberia.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, RouterLink, PhoneInputComponent]
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
    const errorCredenciales = validarCorreo(this.formData.correo) || validarPasswordNueva(this.formData.pw);
    if (errorCredenciales) {
      await this.showToast(errorCredenciales, 'danger');
      return;
    }

    if (this.formData.pw !== this.confirmPw) {
      await this.showToast('Las contraseñas no coinciden', 'danger');
      return;
    }

    this.isLoading = true;

    try {
      await this.authService.registerBarberia(this.formData);

      const alert = await this.alertCtrl.create({
        header: '¡Barbería Registrada!',
        message: 'Ya puedes invitar a tus barberos desde Configuración > Gestión de Equipo, generando un código de un solo uso para cada uno.',
        cssClass: 'premium-alert codigo-alert',
        buttons: [
          {
            text: 'Entendido',
            handler: () => {
              this.router.navigateByUrl('/admin/calendar', { replaceUrl: true });
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
