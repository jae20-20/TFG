import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
    addCircleOutline,
    addOutline,
    businessOutline,
    calendarOutline,
    cameraOutline,
    checkmarkOutline,
    chevronBackOutline,
    chevronForwardOutline,
    closeOutline,
    colorPaletteOutline,
    cutOutline,
    imageOutline,
    imagesOutline,
    keyOutline,
    logOutOutline,
    lockClosedOutline,
    lockOpenOutline,
    pencilOutline,
    peopleOutline,
    personOutline,
    settingsOutline,
    timeOutline,
    trashOutline,
    personAddOutline,
    mailUnreadOutline
} from 'ionicons/icons';

addIcons({
  'color-palette-outline': colorPaletteOutline,
  'log-out-outline': logOutOutline,
  'calendar-outline': calendarOutline,
  'camera-outline': cameraOutline,
  'chevron-back-outline': chevronBackOutline,
  'chevron-forward-outline': chevronForwardOutline,
  'business-outline': businessOutline,
  'image-outline': imageOutline,
  'images-outline': imagesOutline,
  'people-outline': peopleOutline,
  'cut-outline': cutOutline,
  'key-outline': keyOutline,
  'lock-closed-outline': lockClosedOutline,
  'lock-open-outline': lockOpenOutline,
  'person-outline': personOutline,
  'settings-outline': settingsOutline,
  'time-outline': timeOutline,
  'pencil-outline': pencilOutline,
  'checkmark-outline': checkmarkOutline,
  'add-circle-outline': addCircleOutline,
  'add-outline': addOutline,
  'close-outline': closeOutline,
  'trash-outline': trashOutline,
  'person-add-outline': personAddOutline,
  'mail-unread-outline': mailUnreadOutline
});

import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  constructor(private themeService: ThemeService) {}
}
