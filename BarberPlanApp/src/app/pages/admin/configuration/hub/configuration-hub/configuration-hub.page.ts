import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { addIcons } from 'ionicons';
import {
  businessOutline,
  timeOutline,
  cutOutline,
  imageOutline,
  peopleOutline,
  personAddOutline,
  chevronForwardOutline
} from 'ionicons/icons';

@Component({
  selector: 'app-configuration-hub',
  templateUrl: './configuration-hub.page.html',
  styleUrls: ['./configuration-hub.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, RouterModule]
})
export class ConfigurationHubPage {
  constructor() {
    addIcons({
      'business-outline': businessOutline,
      'time-outline': timeOutline,
      'cut-outline': cutOutline,
      'image-outline': imageOutline,
      'people-outline': peopleOutline,
      'person-add-outline': personAddOutline,
      'chevron-forward-outline': chevronForwardOutline
    });
  }
}
