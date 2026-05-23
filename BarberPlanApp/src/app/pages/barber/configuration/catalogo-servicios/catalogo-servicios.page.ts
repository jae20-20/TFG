import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';

@Component({
  selector: 'app-catalogo-servicios',
  templateUrl: './catalogo-servicios.page.html',
  styleUrls: ['./catalogo-servicios.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class CatalogoServiciosPage {
  constructor() { }
}
