import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';
import { ApiService } from '../../../../services/api.service';

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
    galeriaTrabajos: [] as string[]
  };
  savingPerfilVisual = false;
  barberiaError = '';

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
        galeriaTrabajos: this.barberia.galeriaTrabajos || []
      };
    }
  }

  async onLogoSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      try {
        const base64 = await this.processImage(file, 400);
        this.perfilVisualForm.logoUrl = base64;
      } catch (error) {
        console.error('Error processing logo', error);
      }
    }
  }

  async onPortadaSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      try {
        const base64 = await this.processImage(file, 800);
        this.perfilVisualForm.portadaUrl = base64;
      } catch (error) {
        console.error('Error processing cover', error);
      }
    }
  }

  async onGaleriaSelected(event: any) {
    const files = event.target.files;
    if (files) {
      for (let i = 0; i < files.length; i++) {
        try {
          const base64 = await this.processImage(files[i], 800);
          this.perfilVisualForm.galeriaTrabajos.push(base64);
        } catch (error) {
          console.error('Error processing gallery image', error);
        }
      }
    }
  }

  removeGaleriaImage(index: number) {
    this.perfilVisualForm.galeriaTrabajos.splice(index, 1);
  }

  private processImage(file: File, maxSize: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxSize) {
              height = Math.round((height * maxSize) / width);
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width = Math.round((width * maxSize) / height);
              height = maxSize;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
          } else {
            reject(new Error('Could not get canvas context'));
          }
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
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
    } catch (error) {
      console.error('Error al guardar perfil visual:', error);
      this.barberiaError = 'No se ha podido guardar el perfil visual.';
      
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
