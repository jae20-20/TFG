import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
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

  constructor(private apiService: ApiService, private router: Router) {}

  ngOnInit() {
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

  // Legacy method kept for compatibility
  openBarberDetails(barberoId: string) {
    this.router.navigate([`/admin/configuration/manage-team/${barberoId}`]);
  }

  // New method used by template
  openBarber(barbero: any) {
    if (barbero && barbero._id) {
      this.openBarberDetails(barbero._id);
    }
  }

  // Placeholder for adding a new barber
  addBarber() {
    // Navigate to a future 'add barber' page or open a modal
    console.log('Add barber clicked - implement UI later');
  }
}
