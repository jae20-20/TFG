import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { addIcons } from 'ionicons';
import { businessOutline, cutOutline, timeOutline, mailUnreadOutline, starOutline } from 'ionicons/icons';

addIcons({
  'business-outline': businessOutline,
  'cut-outline': cutOutline,
  'time-outline': timeOutline,
  'mail-unread-outline': mailUnreadOutline,
  'star-outline': starOutline
});

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
