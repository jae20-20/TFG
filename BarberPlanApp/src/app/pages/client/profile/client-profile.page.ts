import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, IonicModule } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { ApiService } from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-client-profile',
  templateUrl: './client-profile.page.html',
  styleUrls: ['./client-profile.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class ClientProfilePage implements OnInit {
  user: any = null;
  profile: any = null;
  loadingProfile = false;
  profileError = '';
  currentTab: 'inicio' | 'citas' | 'perfil' = 'perfil';

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private storage: Storage,
    private router: Router,
    private alertCtrl: AlertController
  ) {}

  async ngOnInit() {
    await this.storage.create();
    this.user = await this.storage.get('user');
    this.currentTab = this.router.url.startsWith('/client-appointments')
      ? 'citas'
      : this.router.url.startsWith('/client-home')
        ? 'inicio'
        : 'perfil';
    await this.loadProfile();
  }

  async loadProfile() {
    this.loadingProfile = true;
    this.profileError = '';

    try {
      this.profile = await this.apiService.getMyProfile();
    } catch (error) {
      console.error('Error al cargar perfil:', error);
      this.profileError = 'No se ha podido cargar tu perfil.';
      this.profile = null;
    } finally {
      this.loadingProfile = false;
    }
  }

  getInitials() {
    const source = this.profile || this.user || {};
    const nombre = (source.nombre || '').trim();
    const apellido = (source.apellido || '').trim();
    const initials = `${nombre.charAt(0)}${apellido.charAt(0)}`.trim();
    return initials || 'BP';
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
            this.router.navigateByUrl('/login', { replaceUrl: true });
          }
        }
      ]
    });

    await alert.present();
  }
}