import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, IonicModule } from '@ionic/angular';
import { AuthService } from '../../services/auth.service';
import { StorageService } from '../../services/storage.service';

@Component({
  selector: 'app-admin-home',
  templateUrl: './admin-home.page.html',
  styleUrls: ['./admin-home.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class AdminHomePage implements OnInit {
  user: any = null;
  barberia: any = null;
  activeSection: 'calendario' | 'perfil' | 'configuracion' = 'calendario';

  constructor(
    private authService: AuthService,
    private storage: StorageService,
    private router: Router,
    private alertCtrl: AlertController
  ) {}

  async ngOnInit() {
    this.user = await this.storage.get('user');
  }

  setSection(section: 'calendario' | 'perfil' | 'configuracion') {
    this.activeSection = section;
  }

  async logout() {
    const alert = await this.alertCtrl.create({
      header: 'Cerrar Sesión',
      message: '¿Estás seguro de que quieres cerrar sesión?',
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
