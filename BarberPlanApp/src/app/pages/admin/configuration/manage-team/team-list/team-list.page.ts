import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { ApiService } from '../../../../../services/api.service';

@Component({
  selector: 'app-team-list',
  templateUrl: './team-list.page.html',
  styleUrls: ['./team-list.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class TeamListPage implements OnInit {
  barberos: any[] = [];
  loading = false;
  error = '';
  currentUser: any;

  constructor(
    private apiService: ApiService, 
    private router: Router,
    private storage: Storage
  ) {}

  async ngOnInit() {
    await this.storage.create();
    this.currentUser = await this.storage.get('user');
    this.loadBarberos();
  }

  async loadBarberos() {
    this.loading = true;
    try {
      const barberia = await this.apiService.getMyBarberia();
      const barberiaId = barberia?._id;
      if (barberiaId) {
        this.barberos = await this.apiService.getBarberosBarberia(barberiaId);
      } else {
        this.error = 'No se encontró la barbería del administrador.';
      }
    } catch (e) {
      console.error('Error loading barberos', e);
      this.error = 'No se pudieron cargar los barberos.';
    } finally {
      this.loading = false;
    }
  }

  openBarberDetails(barberoId: string) {
    this.router.navigate([`/admin/configuration/manage-team/${barberoId}`]);
  }

  openBarber(barbero: any) {
    if (barbero && barbero._id) {
      if (this.isAdmin(barbero)) {
        this.router.navigate(['/admin/profile']);
      } else {
        this.openBarberDetails(barbero._id);
      }
    }
  }

  isAdmin(barbero: any): boolean {
    return this.currentUser && (barbero._id === this.currentUser.id || barbero._id === this.currentUser._id);
  }

}
