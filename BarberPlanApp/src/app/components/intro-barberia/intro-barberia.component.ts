import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, NavigationError, Router } from '@angular/router';
import { filter, take } from 'rxjs';

export const INTRO_BARBERIA_ACTIVA = true;

const CLAVE_SESION = 'barberplan_intro_vista';
const PARAMETRO_FORZAR = 'intro';

const PARAMETRO_VISTA_PREVIA_ENTRADA = 'entrada';

const RETIRADA_MAXIMA_MS = 8000;
const RETIRADA_TRAS_SALTO_MS = 1000;

interface Mota {
  x: number;
  y: number;
  tam: number;
}

const MOTAS: readonly Mota[] = [
  { x: 18, y: 70, tam: 3 },
  { x: 31, y: 48, tam: 2 },
  { x: 44, y: 78, tam: 4 },
  { x: 57, y: 40, tam: 2 },
  { x: 66, y: 66, tam: 3 },
  { x: 78, y: 52, tam: 2 },
  { x: 25, y: 30, tam: 2 },
  { x: 72, y: 82, tam: 3 },
  { x: 50, y: 58, tam: 2 }
];

type FaseIntro = 'escena' | 'saliendo' | 'saltada';

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
    return false;
  }
};

const marcarComoVista = (): boolean => {
  try {
    sessionStorage.setItem(CLAVE_SESION, '1');
    return true;
  } catch {
    return false;
  }
};

const prefiereMenosMovimiento = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
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
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private retirada?: ReturnType<typeof setTimeout>;

  readonly visible = signal(debeReproducirse());
  readonly fase = signal<FaseIntro>('escena');
  readonly movimientoReducido = prefiereMenosMovimiento();
  readonly motas = MOTAS;

  private escenaTerminada = false;
  private appCargada = false;

  constructor() {
    if (!this.visible()) return;
    marcarComoVista();
    this.programarRetirada(RETIRADA_MAXIMA_MS);
    this.destroyRef.onDestroy(() => clearTimeout(this.retirada));

    this.appCargada = this.router.navigated;
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd || e instanceof NavigationError), take(1), takeUntilDestroyed())
      .subscribe(() => {
        this.appCargada = true;
        this.salirSiToca();
      });
  }

  saltar(): void {
    if (!this.visible() || this.fase() !== 'escena') return;
    this.fase.set('saltada');
    this.programarRetirada(RETIRADA_TRAS_SALTO_MS);
  }

  alTerminarDestello(evento: AnimationEvent): void {
    if (evento.target !== evento.currentTarget) return;
    this.escenaTerminada = true;
    this.salirSiToca();
  }

  alEmpezarAnimacion(evento: AnimationEvent): void {
    if (evento.target === evento.currentTarget && this.fase() === 'escena') {
      this.fase.set('saliendo');
    }
  }

  alTerminarAnimacion(evento: AnimationEvent): void {
    if (evento.target === evento.currentTarget) this.retirar();
  }

  private salirSiToca(): void {
    if (this.fase() === 'escena' && this.escenaTerminada && this.appCargada) {
      this.fase.set('saliendo');
    }
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
