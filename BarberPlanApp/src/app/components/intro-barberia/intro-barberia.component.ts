import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';

// EXPERIMENTO (rama experimento/animacion-entrada): animación de entrada «la puerta de la barbería».
// Interruptor único: con false no se monta nada y la app arranca como siempre, sin borrar código.
export const INTRO_BARBERIA_ACTIVA = true;

// Una vez por sesión del navegador; con ?intro=1 en la URL se fuerza para volver a verla mientras se ajusta
const CLAVE_SESION = 'barberplan_intro_vista';
const PARAMETRO_FORZAR = 'intro';

// Red de seguridad por si el navegador no emite animationend (pestaña en segundo plano, animaciones desactivadas):
// solo retira la capa, no bloquea la navegación. Holgada respecto a la duración real (2,8 s, en el SCSS)
const RETIRADA_MAXIMA_MS = 4500;
const RETIRADA_TRAS_SALTO_MS = 1000;

// escena: reproduciéndose y captando toques; saliendo: fundido final, ya deja tocar la app; saltada: fundido corto
type FaseIntro = 'escena' | 'saliendo' | 'saltada';

// Con ?entrada=1 (vista previa de la animación de entrada a la app, entrada-app) no se reproduce, para no taparla
const PARAMETRO_VISTA_PREVIA_ENTRADA = 'entrada';

const parametrosUrl = (): URLSearchParams => {
  try {
    return new URLSearchParams(window.location.search);
  } catch {
    return new URLSearchParams();
  }
};

const yaVistaEnLaSesion = (): boolean => {
  try {
    return sessionStorage.getItem(CLAVE_SESION) === '1';
  } catch {
    return false; // sin sessionStorage (modo privado, bloqueado...) se reproduce igualmente
  }
};

const marcarComoVista = (): void => {
  try {
    sessionStorage.setItem(CLAVE_SESION, '1');
  } catch {
    /* sin sessionStorage no se recuerda; no es un error */
  }
};

const debeReproducirse = (): boolean => {
  const parametros = parametrosUrl();
  if (!INTRO_BARBERIA_ACTIVA || parametros.get(PARAMETRO_VISTA_PREVIA_ENTRADA) === '1') return false;
  return parametros.get(PARAMETRO_FORZAR) === '1' || !yaVistaEnLaSesion();
};

@Component({
  selector: 'app-intro-barberia',
  standalone: true,
  templateUrl: './intro-barberia.component.html',
  styleUrls: ['./intro-barberia.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'saltar()' }
})
export class IntroBarberiaComponent {
  private readonly destroyRef = inject(DestroyRef);
  private retirada?: ReturnType<typeof setTimeout>;

  readonly visible = signal(debeReproducirse());
  readonly fase = signal<FaseIntro>('escena');

  constructor() {
    if (!this.visible()) return;
    marcarComoVista();
    this.programarRetirada(RETIRADA_MAXIMA_MS);
    this.destroyRef.onDestroy(() => clearTimeout(this.retirada));
  }

  // Un toque, clic o tecla la termina con un fundido corto. Si ya está en el fundido final no se reinicia
  saltar(): void {
    if (!this.visible() || this.fase() !== 'escena') return;
    this.fase.set('saltada');
    this.programarRetirada(RETIRADA_TRAS_SALTO_MS);
  }

  // La única animación propia de la capa es su fundido de salida (o el corto): cuando empieza, la app ya se ve
  // y deja de captar toques. Los eventos de los elementos internos llegan por burbujeo y se ignoran
  alEmpezarAnimacion(evento: AnimationEvent): void {
    if (evento.target === evento.currentTarget && this.fase() === 'escena') {
      this.fase.set('saliendo');
    }
  }

  alTerminarAnimacion(evento: AnimationEvent): void {
    if (evento.target === evento.currentTarget) this.retirar();
  }

  private programarRetirada(ms: number): void {
    clearTimeout(this.retirada);
    this.retirada = setTimeout(() => this.retirar(), ms);
  }

  private retirar(): void {
    clearTimeout(this.retirada);
    this.visible.set(false);
  }
}
