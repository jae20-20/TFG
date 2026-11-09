import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';
import { ApiService } from '../../../../services/api.service';
import { MAX_IMAGENES_GALERIA, MENSAJE_GALERIA_LLENA, comprimirImagen } from '../../../../services/imagen.util';

@Component({
  selector: 'app-card-configuration',
  templateUrl: './card-configuration.page.html',
  styleUrls: ['./card-configuration.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class CardConfigurationPage implements OnInit {
  barberia: any = null;
  loading = false;
  perfilVisualForm = {
    logoUrl: '',
    portadaUrl: '',
    galeriaTrabajos: [] as string[],
    tags: [] as string[]
  };
  savingPerfilVisual = false;
  barberiaError = '';

  nuevoTag = '';
  tagError = '';
  imagenError = '';
  readonly maxGaleria = MAX_IMAGENES_GALERIA;
  readonly maxTags = 8;
  readonly maxTagLength = 24;

  constructor(
    private apiService: ApiService,
    private toastCtrl: ToastController
  ) { }

  ngOnInit() {
    this.loadData();
  }

  async loadData() {
    this.loading = true;
    try {
      this.barberia = await this.apiService.getMyBarberia();
      this.initializeVisualForm();
    } catch (error) {
      console.error('Error al cargar barbería:', error);
      this.barberiaError = 'No se ha podido cargar los datos de la barbería.';
    } finally {
      this.loading = false;
    }
  }

  private initializeVisualForm() {
    if (this.barberia) {
      this.perfilVisualForm = {
        logoUrl: this.barberia.logoUrl || '',
        portadaUrl: this.barberia.portadaUrl || '',
        galeriaTrabajos: this.barberia.galeriaTrabajos || [],
        tags: this.barberia.tags || []
      };
    }
  }

  // Las imágenes se reducen en el navegador (tamaño y peso máximos por tipo en imagen.util.ts) antes de guardarse
  async onLogoSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      await this.procesar(async () => { this.perfilVisualForm.logoUrl = await comprimirImagen(file, 'logo'); });
    }
    event.target.value = '';
  }

  async onPortadaSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      await this.procesar(async () => { this.perfilVisualForm.portadaUrl = await comprimirImagen(file, 'portada'); });
    }
    event.target.value = '';
  }

  async onGaleriaSelected(event: any) {
    const files: File[] = Array.from(event.target.files ?? []);
    this.imagenError = '';
    for (const file of files) {
      if (this.perfilVisualForm.galeriaTrabajos.length >= this.maxGaleria) {
        this.imagenError = MENSAJE_GALERIA_LLENA;
        break;
      }
      await this.procesar(async () => { this.perfilVisualForm.galeriaTrabajos.push(await comprimirImagen(file, 'galeria')); }, false);
    }
    event.target.value = '';
  }

  removeGaleriaImage(index: number) {
    this.perfilVisualForm.galeriaTrabajos.splice(index, 1);
    this.imagenError = '';
  }

  private async procesar(accion: () => Promise<void>, limpiarError = true) {
    if (limpiarError) this.imagenError = '';
    try {
      await accion();
    } catch (error: any) {
      this.imagenError = error?.message || 'No se pudo procesar la imagen.';
    }
  }

  addTag() {
    this.tagError = '';
    const tag = this.nuevoTag.trim().replace(/\s+/g, ' ');

    if (!tag) return;

    if (tag.length > this.maxTagLength) {
      this.tagError = `Cada etiqueta puede tener hasta ${this.maxTagLength} caracteres.`;
      return;
    }

    if (this.perfilVisualForm.tags.length >= this.maxTags) {
      this.tagError = `Puedes añadir hasta ${this.maxTags} etiquetas.`;
      return;
    }

    const yaExiste = this.perfilVisualForm.tags.some(
      (existente) => existente.toLowerCase() === tag.toLowerCase()
    );
    if (yaExiste) {
      this.nuevoTag = '';
      return;
    }

    this.perfilVisualForm.tags.push(tag);
    this.nuevoTag = '';
  }

  removeTag(index: number) {
    this.perfilVisualForm.tags.splice(index, 1);
    this.tagError = '';
  }

  async savePerfilVisual() {
    if (!this.barberia?._id) return;

    this.savingPerfilVisual = true;
    this.barberiaError = '';

    try {
      await this.apiService.updateBarberia(this.barberia._id, this.perfilVisualForm);
      await this.loadData();
      
      const toast = await this.toastCtrl.create({
        message: 'Tarjeta visual guardada correctamente',
        duration: 2000,
        position: 'bottom',
        color: 'success'
      });
      await toast.present();
    } catch (error: any) {
      console.error('Error al guardar perfil visual:', error);
      // 400: el servidor rechaza una imagen (formato o peso); su mensaje dice cuál
      this.barberiaError = error?.status === 400 && error?.error?.error ? error.error.error : 'No se ha podido guardar el perfil visual.';
      
      const toast = await this.toastCtrl.create({
        message: 'Error al guardar perfil visual',
        duration: 2000,
        position: 'bottom',
        color: 'danger'
      });
      await toast.present();
    } finally {
      this.savingPerfilVisual = false;
    }
  }
}
