import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router } from '@angular/router';
import { Storage } from '@ionic/storage-angular';

export const ENTRADA_APP_ACTIVA = true;

const PARAMETRO_VISTA_PREVIA = 'entrada';

const RE_PANTALLA_ACCESO = /^\/(login|register)/;
const RE_PANTALLA_APP = /^\/(admin|barber|client-)/;

const RETIRADA_MAXIMA_MS = 5000;
const RETIRADA_TRAS_SALTO_MS = 1000;

const SUBTITULO_GENERICO = 'Gestión premium de barberías';
const SUBTITULOS_POR_ROL: Record<string, string> = {
  admin: 'Tu barbería te espera',
  barbero: 'Tu agenda está lista',
  cliente: 'Tu próximo corte empieza aquí'
};

type FaseEntrada = 'inactiva' | 'cubriendo' | 'separando' | 'saltada';

interface UsuarioGuardado {
  nombre?: string;
  rol?: string;
}

const esEntradaEnLaApp = (desde: string | null, hacia: string): boolean =>
  desde !== null && RE_PANTALLA_ACCESO.test(desde) && RE_PANTALLA_APP.test(hacia);

const vistaPreviaPorUrl = (): boolean => {
  try {
    return new URLSearchParams(window.location.search).get(PARAMETRO_VISTA_PREVIA) === '1';
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

@Component({
  selector: 'app-entrada-app',
  standalone: true,
  imports: [NgTemplateOutlet],
  templateUrl: './entrada-app.component.html',
  styleUrls: ['./entrada-app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'saltar()' }
})
export class EntradaAppComponent {
  private readonly router = inject(Router);

  private readonly storage = inject(Storage, { optional: true });
  private readonly destroyRef = inject(DestroyRef);

  readonly fase = signal<FaseEntrada>('inactiva');
  readonly nombre = signal('');
  readonly subtitulo = signal(SUBTITULO_GENERICO);

  private corteTerminado = false;
  private navegacionTerminada = false;
  private urlActual: string | null = null;
  private retirada?: ReturnType<typeof setTimeout>;

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.retirada));
    if (!ENTRADA_APP_ACTIVA) return;

    this.router.events.pipe(takeUntilDestroyed()).subscribe((evento) => {
      if (evento instanceof NavigationStart) {
        if (esEntradaEnLaApp(this.urlActual, evento.url)) this.empezar(false);
      } else if (evento instanceof NavigationEnd) {
        this.urlActual = evento.urlAfterRedirects;
        this.navegacionTerminada = true;
        this.separarSiToca();
      } else if (evento instanceof NavigationCancel || evento instanceof NavigationError) {

        this.saltar();
      }
    });

    if (vistaPreviaPorUrl()) this.empezar(true);
  }

  saltar(): void {
    if (this.fase() !== 'cubriendo') return;
    this.fase.set('saltada');
    this.programarRetirada(RETIRADA_TRAS_SALTO_MS);
  }

  alTerminarCorte(evento: AnimationEvent): void {
    if (evento.target !== evento.currentTarget) return;
    this.corteTerminado = true;
    this.separarSiToca();
  }

  alTerminarSeparacion(evento: AnimationEvent): void {
    if (evento.target === evento.currentTarget && this.fase() === 'separando') this.retirar();
  }

  alTerminarAnimacionCapa(evento: AnimationEvent): void {
    if (evento.target === evento.currentTarget && this.fase() === 'saltada') this.retirar();
  }

  private empezar(navegacionYaTerminada: boolean): void {
    if (this.fase() !== 'inactiva' || prefiereMenosMovimiento()) return;
    this.corteTerminado = false;
    this.navegacionTerminada = navegacionYaTerminada;
    this.nombre.set('');
    this.subtitulo.set(SUBTITULO_GENERICO);
    this.fase.set('cubriendo');
    this.programarRetirada(RETIRADA_MAXIMA_MS);
    void this.cargarSaludo();
  }

  private separarSiToca(): void {
    if (this.fase() === 'cubriendo' && this.corteTerminado && this.navegacionTerminada) {
      this.fase.set('separando');
    }
  }

  private async cargarSaludo(): Promise<void> {
    if (!this.storage) return;
    try {
      await this.storage.create();
      const usuario: UsuarioGuardado | null = await this.storage.get('user');
      this.nombre.set(usuario?.nombre?.trim() ?? '');
      this.subtitulo.set(SUBTITULOS_POR_ROL[usuario?.rol ?? ''] ?? SUBTITULO_GENERICO);
    } catch {
      this.subtitulo.set(SUBTITULO_GENERICO);
    }
  }

  private programarRetirada(ms: number): void {
    clearTimeout(this.retirada);
    this.retirada = setTimeout(() => this.retirar(), ms);
  }

  private retirar(): void {
    clearTimeout(this.retirada);
    this.fase.set('inactiva');
  }
}
