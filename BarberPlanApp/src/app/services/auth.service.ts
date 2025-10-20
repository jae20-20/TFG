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
  async login(correo: string, pw: string) {
    try {
      const response: any = await this.apiService.login(correo, pw).toPromise();
      console.log('Respuesta del backend:', response);
      await this.storage.set('token', response.token);
      return response.user;
    } catch (error) {
      console.error('Error en AuthService login:', error);
      throw error;
    }
  }

  // Registro del usuario
  async register(data: any) {
    try {
      const response: any = await this.apiService.register(data).toPromise();
      console.log('Usuario registrado:', response);
      return response;
    } catch (error) {
      console.error('Error en AuthService register:', error);
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