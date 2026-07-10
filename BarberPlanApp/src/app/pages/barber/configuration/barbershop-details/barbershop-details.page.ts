import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ApiService } from '../../../../services/api.service';

@Component({
  selector: 'app-barbershop-details',
  templateUrl: './barbershop-details.page.html',
  styleUrls: ['./barbershop-details.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class BarbershopDetailsPage implements OnInit {
  barberia: any = null;
  loadingBarberia = false;
  barberiaError = '';

  constructor(private apiService: ApiService) { }

  ngOnInit() {
    this.loadBarberiaData();
  }

  async loadBarberiaData() {
    this.loadingBarberia = true;
    this.barberiaError = '';

    try {
      this.barberia = await this.apiService.getMyBarberia();
    } catch (error) {
      console.error('Error al cargar la barbería en barbero:', error);
      this.barberiaError = 'No se han podido cargar los datos de la barbería.';
      this.barberia = null;
    } finally {
      this.loadingBarberia = false;
    }
  }
}
