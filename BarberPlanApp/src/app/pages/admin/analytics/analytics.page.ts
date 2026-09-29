import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { AlertController, IonicModule, ToastController } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { addIcons } from 'ionicons';
import {
  chevronBackOutline,
  chevronForwardOutline,
  trendingUpOutline,
  trendingDownOutline,
  statsChartOutline,
  peopleOutline,
  chevronDownOutline,
  walletOutline,
  checkmarkCircleOutline
} from 'ionicons/icons';
import { ApiService } from '../../../services/api.service';

addIcons({
  'chevron-back-outline': chevronBackOutline,
  'chevron-forward-outline': chevronForwardOutline,
  'trending-up-outline': trendingUpOutline,
  'trending-down-outline': trendingDownOutline,
  'stats-chart-outline': statsChartOutline,
  'people-outline': peopleOutline,
  'chevron-down-outline': chevronDownOutline,
  'wallet-outline': walletOutline,
  'checkmark-circle-outline': checkmarkCircleOutline
});

type Periodo = 'dia' | 'semana' | 'mes';
type Seccion = 'ganancias' | 'clientes';

interface PuntoGrafica {
  x: number;
  yEsperado: number;
  yReal: number;
}

const GRAFICA_ANCHO = 320;
const GRAFICA_ALTO = 150;
const GRAFICA_MARGEN = 10;

const NOMBRE_PERIODO_ANTERIOR: Record<Periodo, string> = {
  dia: 'el día anterior',
  semana: 'la semana anterior',
  mes: 'el mes anterior'
};

@Component({
  selector: 'app-analytics',
  templateUrl: './analytics.page.html',
  styleUrls: ['./analytics.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class AnalyticsPage {
  periodo: Periodo = 'mes';
  seccion: Seccion = 'ganancias';
  fechaBase = this.toDateKey(new Date());

  datos: any = null;
  grafica = { puntos: [] as PuntoGrafica[], lineaEsperados: '', lineaReales: '', guias: [] as number[] };
  readonly graficaAncho = GRAFICA_ANCHO;
  readonly graficaAlto = GRAFICA_ALTO;
  puntoSeleccionado: number | null = null;
  deudorAbierto: string | null = null;
  cobrando: string | null = null;
  loading = false;
  error = '';

  private barberiaId: string | null = null;
  private peticionActual = 0;
  private readonly euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

  constructor(
    private apiService: ApiService,
    private storage: Storage,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController
  ) {}

  async ionViewWillEnter() {
    if (!this.barberiaId) {
      await this.storage.create();
      const user = await this.storage.get('user');
      this.barberiaId = user?.barberiaId || null;
    }
    await this.cargar();
  }

  async cargar(event?: any) {
    if (!this.barberiaId) {
      this.error = 'No se ha encontrado la barbería asociada al administrador.';
      event?.target?.complete();
      return;
    }

    const peticion = ++this.peticionActual;
    this.loading = !event;
    this.error = '';

    try {
      const datos = await this.apiService.getAnaliticasBarberia(this.barberiaId, this.periodo, this.fechaBase);
      if (peticion === this.peticionActual) {
        this.datos = datos;
        this.puntoSeleccionado = null;
        this.prepararGrafica();
      }
    } catch (err: any) {
      if (peticion === this.peticionActual) {
        this.error = err?.error?.error || 'No se pudieron cargar las estadísticas.';
      }
    } finally {
      if (peticion === this.peticionActual) this.loading = false;
      event?.target?.complete();
    }
  }

  setPeriodo(periodo: Periodo) {
    if (this.periodo === periodo) return;
    this.periodo = periodo;
    this.cargar();
  }

  setSeccion(seccion: Seccion) {
    this.seccion = seccion;
  }

  moverPeriodo(direccion: 1 | -1) {
    const [y, m, d] = this.fechaBase.split('-').map(Number);
    const fecha = new Date(y, m - 1, d);
    if (this.periodo === 'dia') fecha.setDate(fecha.getDate() + direccion);
    else if (this.periodo === 'semana') fecha.setDate(fecha.getDate() + 7 * direccion);
    else fecha.setMonth(fecha.getMonth() + direccion, 1);
    this.fechaBase = this.toDateKey(fecha);
    this.cargar();
  }

  irAHoy() {
    this.fechaBase = this.toDateKey(new Date());
    this.cargar();
  }

  get esPeriodoActual(): boolean {
    if (!this.datos) return true;
    const hoy = this.toDateKey(new Date());
    return hoy >= this.datos.desde && hoy <= this.datos.hasta;
  }

  get tituloPeriodo(): string {
    const desde = this.datos?.desde ?? this.fechaBase;
    const hasta = this.datos?.hasta ?? this.fechaBase;
    const inicio = this.parseDateKey(desde);

    if (this.periodo === 'mes') {
      return inicio.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    }
    if (this.periodo === 'dia') {
      return inicio.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    }
    const fin = this.parseDateKey(hasta);
    const corto: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    return `${inicio.toLocaleDateString('es-ES', corto)} – ${fin.toLocaleDateString('es-ES', corto)}`;
  }

  get textoComparacion(): string {
    return `vs. ${NOMBRE_PERIODO_ANTERIOR[this.periodo]}`;
  }

  get porcentajeCobrado(): number {
    const esperado = this.datos?.resumen?.ingresosEsperados || 0;
    if (esperado <= 0) return 0;
    return Math.min(100, Math.round((this.datos.resumen.ingresosReales / esperado) * 100));
  }

  get maxSerie(): number {
    const valores = (this.datos?.serie || []).flatMap((p: any) => [p.esperados, p.reales]);
    return Math.max(1, ...valores);
  }

  get hayMovimientoSerie(): boolean {
    return (this.datos?.serie || []).some((p: any) => p.esperados > 0 || p.reales > 0);
  }

  get maxServicio(): number {
    return Math.max(1, ...(this.datos?.topServicios || []).map((s: any) => s.citas));
  }

  get tasaCancelacion(): number {
    const r = this.datos?.resumen;
    const total = (r?.citas || 0) + (r?.canceladas || 0);
    return total > 0 ? Math.round((r.canceladas / total) * 100) : 0;
  }

  variacion(actual: number, anterior: number): number | null {
    if (!anterior) return null;
    return Math.round(((actual - anterior) / anterior) * 100);
  }

  get puntoActivo(): any {
    return this.puntoSeleccionado === null ? null : this.datos?.serie?.[this.puntoSeleccionado] ?? null;
  }

  seleccionarPunto(index: number) {
    this.puntoSeleccionado = this.puntoSeleccionado === index ? null : index;
  }

  private prepararGrafica() {
    const serie: any[] = this.datos?.serie || [];
    const total = serie.length;
    const max = this.maxSerie;
    const altoUtil = GRAFICA_ALTO - GRAFICA_MARGEN * 2;
    const y = (valor: number) => GRAFICA_MARGEN + altoUtil - (valor / max) * altoUtil;

    const puntos = serie.map((p, i) => ({
      x: ((i + 0.5) / total) * GRAFICA_ANCHO,
      yEsperado: y(p.esperados),
      yReal: y(p.reales)
    }));

    this.grafica = {
      puntos,
      lineaEsperados: puntos.map(p => `${p.x},${p.yEsperado}`).join(' '),
      lineaReales: puntos.map(p => `${p.x},${p.yReal}`).join(' '),
      guias: [0, 0.5, 1].map(f => GRAFICA_MARGEN + altoUtil * f)
    };
  }

  toggleDeudor(clave: string) {
    this.deudorAbierto = this.deudorAbierto === clave ? null : clave;
  }

  async confirmarCobro(deudor: any, cita: any) {
    const alert = await this.alertCtrl.create({
      header: 'Marcar como pagada',
      message: `¿${deudor.nombre} ha pagado ${this.formatEuro(cita.importe)} por ${cita.servicio}?`,
      cssClass: 'premium-alert',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Marcar pagada', handler: () => { this.cobrar(cita); } }
      ]
    });
    await alert.present();
  }

  private async cobrar(cita: any) {
    this.cobrando = cita.id;
    try {
      await this.apiService.updateCitaPago(cita.id, true, cita.importe);
      const toast = await this.toastCtrl.create({ message: 'Cita marcada como pagada.', duration: 2000, color: 'success' });
      toast.present();
      await this.cargar();
    } catch (err: any) {
      const toast = await this.toastCtrl.create({
        message: err?.error?.error || 'No se pudo registrar el pago.',
        duration: 2500,
        color: 'danger'
      });
      toast.present();
    } finally {
      this.cobrando = null;
    }
  }

  formatFechaCorta(fecha: string): string {
    return this.parseDateKey(fecha).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  mostrarEtiquetaSerie(index: number, total: number): boolean {
    if (this.periodo !== 'mes') return true;
    return index === 0 || index === total - 1 || (index + 1) % 5 === 0;
  }

  porcentaje(parte: number, total: number): number {
    return total > 0 ? Math.min(100, Math.round((parte / total) * 100)) : 0;
  }

  formatEuro(valor: number): string {
    return this.euro.format(valor || 0);
  }

  getInitials(nombre: string): string {
    return (nombre || '?')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(p => p[0].toUpperCase())
      .join('');
  }

  private toDateKey(fecha: Date): string {
    const y = fecha.getFullYear();
    const m = String(fecha.getMonth() + 1).padStart(2, '0');
    const d = String(fecha.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private parseDateKey(key: string): Date {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
}
