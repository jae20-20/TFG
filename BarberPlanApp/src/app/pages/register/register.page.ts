import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule, ToastController, IonContent } from '@ionic/angular';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../services/theme.service';
import { EDAD_MINIMA, MENSAJE_SIN_CONSENTIMIENTO } from '../../services/privacidad.util';
import { validarCorreo, validarPasswordNueva } from '../../services/validacion-credenciales.util';

type Rol = 'cliente' | 'barbero';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  standalone: true,
  imports: [IonicModule, FormsModule, CommonModule],
})
export class RegisterPage implements AfterViewInit {
  @ViewChild(IonContent, { static: false }) content?: IonContent;
  @ViewChild('frontFace') frontFace?: ElementRef<HTMLElement>;
  @ViewChild('backFace') backFace?: ElementRef<HTMLElement>;

  rol: Rol = 'cliente';
  cardHeight: number | null = null;

  // Campos comunes
  nombre = '';
  apellido = '';
  usuario = '';
  correo = '';
  pw = '';
  confirmPw = '';

  // Aceptación de la política de privacidad (obligatoria; el servidor también la exige)
  aceptaPrivacidad = false;
  readonly edadMinima = EDAD_MINIMA;

  // Solo cliente
  ciudad = '';
  ciudades = ['Madrid', 'Valencia', 'Sevilla'];

  // Solo barbero: primero se valida el código de invitación, después se
  // revela el resto del formulario con nombre/apellido precargados.
  code = '';
  barberStep: 'code' | 'details' = 'code';
  validandoCodigo = false;
  codeError = '';
  invitacionInfo: { nombre: string; apellido: string; cargo: string; nombreBarberia: string | null } | null = null;
  registrando = false;

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private router: Router,
    private toastCtrl: ToastController,
    private themeService: ThemeService
  ) {}

  ionViewWillEnter() {
    this.themeService.applyDefaultPublicTheme();
    this.content?.scrollToTop(0);
  }

  ngAfterViewInit() {
    this.updateCardHeight();
  }

  @HostListener('window:resize')
  onResize() {
    this.updateCardHeight();
  }

  // Recalcula la altura de la tarjeta a partir de la cara actualmente visible
  // (front/back tienen contenidos de alturas distintas, y la cara de barbero
  // cambia de altura entre el paso del código y el de los datos).
  private updateCardHeight() {
    setTimeout(() => {
      const el = this.rol === 'cliente' ? this.frontFace?.nativeElement : this.backFace?.nativeElement;
      if (el) {
        this.cardHeight = el.scrollHeight;
      }
    });
  }

  selectRol(rol: Rol) {
    if (this.rol === rol) return;
    this.rol = rol;

    // El nombre/apellido tiene un significado distinto en cada cara (libre
    // para cliente, precargado por la invitación para barbero), así que se
    // reinicia el paso de barbero para evitar estados mezclados.
    this.nombre = '';
    this.apellido = '';
    this.barberStep = 'code';
    this.code = '';
    this.codeError = '';
    this.invitacionInfo = null;

    this.updateCardHeight();
  }

  async validateCode() {
    if (!this.code.trim() || this.validandoCodigo) return;

    this.validandoCodigo = true;
    this.codeError = '';
    try {
      const response = await this.apiService.validateInvitationCode(this.code.trim());
      this.invitacionInfo = {
        nombre: response.nombre,
        apellido: response.apellido,
        cargo: response.cargo,
        nombreBarberia: response.nombreBarberia
      };
      this.nombre = response.nombre;
      this.apellido = response.apellido;
      this.barberStep = 'details';
    } catch (error: any) {
      this.codeError = error?.error?.error || 'Código inválido o caducado.';
    } finally {
      this.validandoCodigo = false;
      this.updateCardHeight();
    }
  }

  backToCodeStep() {
    this.barberStep = 'code';
    this.invitacionInfo = null;
    this.updateCardHeight();
  }

  isClienteValid(): boolean {
    return !!(
      this.nombre.trim() &&
      this.apellido.trim() &&
      this.usuario.trim() &&
      this.correo.trim() &&
      this.ciudad.trim() &&
      this.pw &&
      this.confirmPw
    );
  }

  isBarberoValid(): boolean {
    return !!(
      this.barberStep === 'details' &&
      this.nombre.trim() &&
      this.apellido.trim() &&
      this.usuario.trim() &&
      this.correo.trim() &&
      this.pw &&
      this.confirmPw
    );
  }

  async register() {
    const valid = this.rol === 'cliente' ? this.isClienteValid() : this.isBarberoValid();
    if (!valid) {
      await this.showToast('Completa todos los campos obligatorios.', 'danger');
      return;
    }

    const errorCredenciales = validarCorreo(this.correo) || validarPasswordNueva(this.pw);
    if (errorCredenciales) {
      await this.showToast(errorCredenciales, 'danger');
      return;
    }

    if (this.pw !== this.confirmPw) {
      await this.showToast('Las contraseñas no coinciden.', 'danger');
      return;
    }

    if (!this.aceptaPrivacidad) {
      await this.showToast(MENSAJE_SIN_CONSENTIMIENTO, 'danger');
      return;
    }

    const data: any = {
      nombre: this.nombre,
      apellido: this.apellido,
      usuario: this.usuario,
      correo: this.correo,
      pw: this.pw,
      rol: this.rol,
      aceptaPrivacidad: true,
    };

    if (this.rol === 'cliente') {
      data.ciudad = this.ciudad;
    } else {
      data.code = this.code;
    }

    this.registrando = true;
    try {
      await this.authService.register(data);
      await this.showToast('Cuenta creada con éxito.', 'success');
      this.router.navigateByUrl('/login');
    } catch (error: any) {
      const message = error?.error?.error || 'Error al crear la cuenta. Inténtalo de nuevo.';
      await this.showToast(message, 'danger');
    } finally {
      this.registrando = false;
    }
  }

  private async showToast(message: string, color: string) {
    const toast = await this.toastCtrl.create({ message, duration: 2500, color, position: 'bottom' });
    await toast.present();
  }

  goToLogin() {
    this.router.navigateByUrl('/login');
  }

  goToBarberiaRegister(){
    this.router.navigateByUrl('/register-barberia');
  }
}
