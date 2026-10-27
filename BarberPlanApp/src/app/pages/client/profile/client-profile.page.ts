import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, NavigationEnd } from '@angular/router';
import { NavController, AlertController, IonicModule, ToastController } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { ApiService } from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';
import { ThemeHeaderBtnComponent } from '../../../components/theme-header-btn/theme-header-btn.component';
import { PhoneInputComponent } from '../../../components/phone-input/phone-input.component';
import { PhoneDisplayPipe } from '../../../components/phone-input/phone-display.pipe';
import { CambiarPasswordModalComponent } from '../../../components/cambiar-password-modal/cambiar-password-modal.component';

import { addIcons } from 'ionicons';
import { homeOutline, calendarOutline, personOutline, logOutOutline, pencilOutline, checkmarkOutline, closeOutline, cameraOutline } from 'ionicons/icons';

@Component({
  selector: 'app-client-profile',
  templateUrl: './client-profile.page.html',
  styleUrls: ['./client-profile.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, ThemeHeaderBtnComponent, PhoneInputComponent, PhoneDisplayPipe, CambiarPasswordModalComponent]
})
export class ClientProfilePage implements OnInit {
  // Al cerrar sesión, navigateRoot destruye las pantallas abiertas: la siguiente sesión empieza sin el estado de la anterior
  private navCtrl = inject(NavController);
  user: any = null;
  profile: any = null;
  loadingProfile = false;
  profileError = '';
  currentTab: 'inicio' | 'citas' | 'perfil' = 'perfil';

  clientEditForm: any = null;
  isEditingClient = false;
  isPasswordModalOpen = false;
  savingClient = false;
  clientProfileError = '';
  ciudades = ['Madrid', 'Valencia', 'Sevilla'];

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private storage: Storage,
    private router: Router,
    private alertCtrl: AlertController,
    private cdr: ChangeDetectorRef,
    private toastCtrl: ToastController
  ) {
    addIcons({
      'home-outline': homeOutline,
      'calendar-outline': calendarOutline,
      'person-outline': personOutline,
      'log-out-outline': logOutOutline,
      'pencil-outline': pencilOutline,
      'checkmark-outline': checkmarkOutline,
      'close-outline': closeOutline,
      'camera-outline': cameraOutline
    });

    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        if (this.router.url.startsWith('/client-profile')) {
          this.currentTab = 'perfil';
          this.cdr.detectChanges();
        }
      }
    });
  }

  ionViewWillEnter() {
    this.currentTab = 'perfil';
    this.cdr.detectChanges();
    this.loadProfile();
  }

  async ngOnInit() {
    await this.storage.create();
    this.user = await this.storage.get('user');
    this.currentTab = 'perfil';
    this.initializeClientEditForm();
    await this.loadProfile();
  }

  private initializeClientEditForm() {
    const source = this.profile || this.user || {};
    this.clientEditForm = {
      nombre: source.nombre || '',
      apellido: source.apellido || '',
      usuario: source.usuario || '',
      telefono: source.telefono || '',
      ciudad: source.ciudad || '',
      correo: source.correo || source.email || '',
      avatar: source.avatar || ''
    };
  }

  async loadProfile() {
    this.loadingProfile = true;
    this.profileError = '';

    try {
      this.profile = await this.apiService.getMyProfile();
      this.user = { ...this.user, ...this.profile };
      await this.storage.set('user', this.user);
      this.initializeClientEditForm();
    } catch (error) {
      console.error('Error al cargar perfil:', error);
      this.profileError = 'No se ha podido cargar tu perfil.';
      this.initializeClientEditForm();
    } finally {
      this.loadingProfile = false;
      this.cdr.detectChanges();
    }
  }

  enterClientEditMode() {
    this.initializeClientEditForm();
    this.isEditingClient = true;
    this.clientProfileError = '';
  }

  cancelClientEdit() {
    this.isEditingClient = false;
    this.clientProfileError = '';
    this.initializeClientEditForm();
  }

  async onAvatarSelected(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const base64 = await this.readAndCompressImage(file);
      if (!this.clientEditForm) {
        this.initializeClientEditForm();
      }
      this.clientEditForm.avatar = base64;
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error al procesar la imagen de perfil:', err);
    }
  }

  removeAvatar(event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    if (this.clientEditForm) {
      this.clientEditForm.avatar = '';
      this.cdr.detectChanges();
    }
  }

  private readAndCompressImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 400;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
          } else {
            resolve(e.target.result);
          }
        };
        img.onerror = () => reject('Error loading image');
        img.src = e.target.result;
      };
      reader.onerror = () => reject('Error reading file');
      reader.readAsDataURL(file);
    });
  }

  async saveClientProfile() {
    if (!this.clientEditForm?.nombre || !this.clientEditForm?.apellido || !this.clientEditForm?.usuario) {
      this.clientProfileError = 'Nombre, apellidos y usuario son obligatorios.';
      return;
    }

    this.savingClient = true;
    this.clientProfileError = '';

    try {
      const payload = {
        nombre: this.clientEditForm.nombre,
        apellido: this.clientEditForm.apellido,
        usuario: this.clientEditForm.usuario,
        telefono: this.clientEditForm.telefono,
        ciudad: this.clientEditForm.ciudad,
        avatar: this.clientEditForm.avatar || ''
      };

      const response = await this.apiService.updateMyProfile(payload);

      const updatedUser = response?.user || payload;
      this.user = { ...this.user, ...updatedUser };
      this.profile = { ...this.profile, ...updatedUser };
      await this.storage.set('user', this.user);

      this.initializeClientEditForm();
      this.isEditingClient = false;

      const toast = await this.toastCtrl.create({
        message: 'Perfil actualizado correctamente',
        duration: 2000,
        position: 'bottom',
        color: 'success'
      });
      await toast.present();
    } catch (error) {
      console.error('Error al guardar perfil de cliente:', error);
      this.clientProfileError = 'No se ha podido guardar el perfil.';

      const toast = await this.toastCtrl.create({
        message: 'Error al guardar perfil',
        duration: 2000,
        position: 'bottom',
        color: 'danger'
      });
      await toast.present();
    } finally {
      this.savingClient = false;
      this.cdr.detectChanges();
    }
  }

  getInitials() {
    const source = this.profile || this.user || {};
    const nombre = (source.nombre || '').trim();
    const apellido = (source.apellido || '').trim();
    const initials = `${nombre.charAt(0)}${apellido.charAt(0)}`.trim();
    return initials || 'CL';
  }

  isActiveTab(tab: 'inicio' | 'citas' | 'perfil') {
    return this.currentTab === tab;
  }

  goToTab(tab: 'inicio' | 'citas' | 'perfil') {
    this.currentTab = tab;

    if (tab === 'inicio') {
      this.router.navigateByUrl('/client-home');
      return;
    }

    if (tab === 'citas') {
      this.router.navigateByUrl('/client-appointments');
      return;
    }

    this.router.navigateByUrl('/client-profile');
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
            this.navCtrl.navigateRoot('/login');
          }
        }
      ]
    });

    await alert.present();
  }
}