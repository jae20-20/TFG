//logica de autenticacion
import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { StorageService } from './storage.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  constructor(private apiService: ApiService, private storage: StorageService) {}

  // Login del usuario
  async login(email: string, password: string) {
    try {
      const response: any = await this.apiService.login(email, password).toPromise();
      await this.storage.set('token', response.token); // Guarda el token en el almacenamiento
      return response.user; 
    } catch (error) {
      throw error;
    }
  }

  // Registro del usuario
  async register(data: any) {
    try {
      const response: any = await this.apiService.register(data).toPromise();
      return response; // Devuelve la respuesta del registro
    } catch (error) {
      throw error;
    }
  }

  // Logout del usuario
  async logout() {
    await this.storage.remove('token'); // Elimina el token del almacenamiento
  }

  // Obtener el token almacenado
  async getToken() {
    return await this.storage.get('token');
  }
}