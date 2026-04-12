import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
    addOutline,
    businessOutline,
    calendarOutline,
    checkmarkOutline,
    chevronBackOutline,
    chevronForwardOutline,
    closeOutline,
    cutOutline,
    keyOutline,
    logOutOutline,
    pencilOutline,
    peopleOutline,
    personOutline,
    settingsOutline,
    trashOutline
} from 'ionicons/icons';

addIcons({
  'log-out-outline': logOutOutline,
  'calendar-outline': calendarOutline,
  'chevron-back-outline': chevronBackOutline,
  'chevron-forward-outline': chevronForwardOutline,
  'business-outline': businessOutline,
  'people-outline': peopleOutline,
  'cut-outline': cutOutline,
  'key-outline': keyOutline,
  'person-outline': personOutline,
  'settings-outline': settingsOutline,
  'pencil-outline': pencilOutline,
  'checkmark-outline': checkmarkOutline,
  'add-outline': addOutline,
  'close-outline': closeOutline,
  'trash-outline': trashOutline
});

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  constructor() {}
}
