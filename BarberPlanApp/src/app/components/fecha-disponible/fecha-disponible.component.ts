import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronBackOutline, chevronForwardOutline } from 'ionicons/icons';

interface CeldaDia {
  key: string;
  numero: number;
  disponible: boolean;
  esHoy: boolean;
  seleccionado: boolean;
}

// Calendario mensual en el que solo se pueden elegir los días que tienen hueco
@Component({
  selector: 'app-fecha-disponible',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './fecha-disponible.component.html',
  styleUrls: ['./fecha-disponible.component.scss']
})
export class FechaDisponibleComponent implements OnChanges {
  @Input() mes = '';
  @Input() minMes = '';
  @Input() maxMes = '';
  @Input() diasDisponibles: string[] = [];
  @Input() seleccionada = '';
  @Input() cargando = false;
  @Output() mesChange = new EventEmitter<string>();
  @Output() diaSeleccionado = new EventEmitter<string>();

  readonly etiquetasSemana = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  huecosInicio: number[] = [];
  celdas: CeldaDia[] = [];
  etiquetaMes = '';

  constructor() {
    addIcons({ 'chevron-back-outline': chevronBackOutline, 'chevron-forward-outline': chevronForwardOutline });
  }

  get puedeRetroceder() {
    return !!this.minMes && this.mes > this.minMes;
  }

  get puedeAvanzar() {
    return !!this.maxMes && this.mes < this.maxMes;
  }

  get sinDias() {
    return !this.cargando && this.diasDisponibles.length === 0;
  }

  ngOnChanges() {
    if (!/^\d{4}-\d{2}$/.test(this.mes)) {
      this.celdas = [];
      this.huecosInicio = [];
      this.etiquetaMes = '';
      return;
    }

    const [anio, numeroMes] = this.mes.split('-').map(Number);
    const disponibles = new Set(this.diasDisponibles);
    const hoy = this.claveLocal(new Date());
    const diasMes = new Date(anio, numeroMes, 0).getDate();
    // getDay(): domingo = 0; la semana empieza en lunes
    const primerDiaSemana = (new Date(anio, numeroMes - 1, 1).getDay() + 6) % 7;

    this.huecosInicio = Array.from({ length: primerDiaSemana });
    this.celdas = Array.from({ length: diasMes }, (_, i) => {
      const key = `${this.mes}-${String(i + 1).padStart(2, '0')}`;
      return {
        key,
        numero: i + 1,
        disponible: disponibles.has(key),
        esHoy: key === hoy,
        seleccionado: key === this.seleccionada
      };
    });

    const texto = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(new Date(anio, numeroMes - 1, 1));
    this.etiquetaMes = texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  cambiarMes(paso: number) {
    const [anio, numeroMes] = this.mes.split('-').map(Number);
    const destino = new Date(anio, numeroMes - 1 + paso, 1);
    const nuevo = `${destino.getFullYear()}-${String(destino.getMonth() + 1).padStart(2, '0')}`;
    if ((paso < 0 && !this.puedeRetroceder) || (paso > 0 && !this.puedeAvanzar)) return;
    this.mesChange.emit(nuevo);
  }

  elegir(celda: CeldaDia) {
    if (celda.disponible) {
      this.diaSeleccionado.emit(celda.key);
    }
  }

  private claveLocal(fecha: Date) {
    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
  }
}
