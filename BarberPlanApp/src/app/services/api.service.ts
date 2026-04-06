//manejar http genericas
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private apiUrl = 'http://localhost:5050';

  constructor(private http: HttpClient, private storage: Storage) {}

  private async getAuthHeaders() {
    const storage = await this.storage.create();
    const token = await storage.get('token');

    if (!token) {
      return new HttpHeaders();
    }

    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  // Método para login
  login(correo: string, pw: string) {
    return this.http.post(`${this.apiUrl}/user/login`, { correo, pw});
  }

  // Método para registro de usuario
  register(data: any) {
    return this.http.post(`${this.apiUrl}/user/register`, data);
  }

  // Método para registro de barbería + admin
  registerBarberia(data: any) {
    return this.http.post(`${this.apiUrl}/barberia/register`, data);
  }

  // Validar código de barbería
  validateBarberiaCode(code: string) {
    return this.http.post(`${this.apiUrl}/barberia/validate-code`, { code });
  }

  // Obtener citas de una barbería 
  async getCitasBarberia(barberiaId: string) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/cita/barberia/${barberiaId}`, { headers })
    );
  }
}