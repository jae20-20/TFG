import { Location } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline } from 'ionicons/icons';
import { environment } from '../../../environments/environment';
import { EDAD_MINIMA, POLITICA_FECHA, POLITICA_VERSION } from '../../services/privacidad.util';

// Política de privacidad: página pública (sin guard), enlazada desde los tres registros y los tres perfiles.
// Los datos de contacto salen del entorno; lo que aparece entre corchetes lo completa el responsable antes de desplegar.
@Component({
  selector: 'app-privacidad',
  templateUrl: './privacidad.page.html',
  styleUrls: ['./privacidad.page.scss'],
  standalone: true,
  imports: [IonicModule]
})
export class PrivacidadPage {
  private location = inject(Location);
  private router = inject(Router);

  readonly responsable = environment.privacidad.responsable;
  readonly correoContacto = environment.privacidad.correoContacto;
  readonly version = POLITICA_VERSION;
  readonly fecha = POLITICA_FECHA;
  readonly edadMinima = EDAD_MINIMA;

  constructor() {
    addIcons({ 'arrow-back-outline': arrowBackOutline });
  }

  // Abierta en una pestaña nueva (desde el registro) no hay historial al que volver: se va al inicio de sesión
  volver() {
    if (window.history.length > 1) {
      this.location.back();
    } else {
      this.router.navigateByUrl('/login');
    }
  }
}
