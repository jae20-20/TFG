import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router } from '@angular/router';
import { Storage } from '@ionic/storage-angular';

// EXPERIMENTO (rama experimento/animacion-entrada): animación al entrar en la app tras iniciar sesión, «el corte de
// navaja». Interruptor único: con false no se escucha la navegación ni se monta nada.
export const ENTRADA_APP_ACTIVA = true;

// Vista previa sin iniciar sesión: ?entrada=1 en cualquier ruta la reproduce al cargar
const PARAMETRO_VISTA_PREVIA = 'entrada';

// «Entrar en la app» es pasar de una pantalla de acceso a una privada (no recargar ya dentro ni cerrar sesión)
const RE_PANTALLA_ACCESO = /^\/(login|register)/;
const RE_PANTALLA_APP = /^\/(admin|barber|client-)/;

// Red de seguridad por si no llega animationend o la navegación no termina: solo retira la capa
const RETIRADA_MAXIMA_MS = 5000;
const RETIRADA_TRAS_SALTO_MS = 1000;

const SUBTITULO_GENERICO = 'Gestión premium de barberías';
const SUBTITULOS_POR_ROL: Record<string, string> = {
  admin: 'Tu barbería te espera',
  barbero: 'Tu agenda está lista',
  cliente: 'Tu próximo corte empieza aquí'
};

// cubriendo: tapa el login, saluda y corta; separando: las mitades se abren y la app ya responde; saltada: fundido corto
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

// Con movimiento reducido no se reproduce: la transición de página de Ionic ya basta
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
  // Opcional: sin almacenamiento (p. ej. en pruebas) se usa el saludo genérico
  private readonly storage = inject(Storage, { optional: true });
  private readonly destroyRef = inject(DestroyRef);

  readonly fase = signal<FaseEntrada>('inactiva');
  readonly nombre = signal('');
  readonly subtitulo = signal(SUBTITULO_GENERICO);

  // La separación espera a que terminen el corte (CSS) y la navegación (la pantalla nueva ya está debajo)
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
        // Un guard la ha rechazado (sin sesión) o ha fallado: no se llega a entrar
        this.saltar();
      }
    });

    if (vistaPreviaPorUrl()) this.empezar(true);
  }

  // Un toque, clic o tecla mientras tapa la pantalla la termina con un fundido corto
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

  // La capa solo tiene su fundido de entrada y el de salto; únicamente el de salto la retira
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

  // El login guarda el usuario antes de navegar, así que se le puede saludar por su nombre
  private async cargarSaludo(): Promise<void> {
    if (!this.storage) return;
    try {
      await this.storage.create();
      const usuario: UsuarioGuardado | null = await this.storage.get('user');
      this.nombre.set(usuario?.nombre?.trim() ?? '');
      this.subtitulo.set(SUBTITULOS_POR_ROL[usuario?.rol ?? ''] ?? SUBTITULO_GENERICO);
    } catch {
      /* sin almacenamiento disponible se queda el saludo genérico */
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
