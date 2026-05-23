import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';

@Component({
  selector: 'app-barbershop-details',
  templateUrl: './barbershop-details.page.html',
  styleUrls: ['./barbershop-details.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class BarbershopDetailsPage {
  constructor() { }
}
