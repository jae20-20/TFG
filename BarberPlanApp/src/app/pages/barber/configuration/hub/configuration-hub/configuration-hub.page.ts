import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-configuration-hub',
  templateUrl: './configuration-hub.page.html',
  styleUrls: ['./configuration-hub.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, RouterModule]
})
export class ConfigurationHubPage {
  constructor() { }
}
