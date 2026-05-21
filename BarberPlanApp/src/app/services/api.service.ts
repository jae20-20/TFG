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

  // Obtener barberías públicas para clientes
  async getBarberias() {
    return await firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/barberia`)
    );
  }

  // Obtener detalle de barbería pública
  async getBarberia(barberiaId: string) {
    return await firstValueFrom(
      this.http.get<any>(`${this.apiUrl}/barberia/${barberiaId}`)
    );
  }

  // Obtener servicios públicos de una barbería
  async getServiciosBarberia(barberiaId: string) {
    return await firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/barberia/${barberiaId}/servicios`)
    );
  }

  // Obtener barberos públicos de una barbería
  async getBarberosBarberia(barberiaId: string) {
    return await firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/barberia/${barberiaId}/barberos`)
    );
  }

  // Obtener disponibilidad pública de un barbero en fecha
  async getDisponibilidadBarbero(barberoId: string, fecha: string, barberiaId: string) {
    return await firstValueFrom(
      this.http.get<any>(`${this.apiUrl}/cita/disponibilidad/${barberoId}/${fecha}`, {
        params: { barberiaId }
      })
    );
  }

  // Obtener mis citas (cliente autenticado)
  async getMisCitas() {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/cita/mis-citas`, { headers })
    );
  }

  // Crear cita (cliente autenticado)
  async crearCita(data: {
    barberiaId: string;
    barberoId: string;
    servicioId: string;
    fecha: string;
    horaInicio: string;
  }) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.post<any>(`${this.apiUrl}/cita`, data, { headers })
    );
  }

  // Obtener citas de una barbería 
  async getCitasBarberia(barberiaId: string) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/cita/barberia/${barberiaId}`, { headers })
    );
  }

  // Obtener citas del barbero autenticado
  async getCitasBarbero() {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/cita/barbero`, { headers })
    );
  }

  // Obtener la barbería completa asociada al admin autenticado
  async getMyBarberia() {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.get<any>(`${this.apiUrl}/barberia/my/barberia`, { headers })
    );
  }

  // Obtener el horario estructurado de la barbería autenticada
  async getMyHorario() {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.get<any>(`${this.apiUrl}/barberia/my/horario`, { headers })
    );
  }

  // Actualizar datos de la barbería
  async updateBarberia(barberiaId: string, data: any) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.put<any>(`${this.apiUrl}/barberia/${barberiaId}`, data, { headers })
    );
  }

  // Actualizar el horario estructurado de la barbería autenticada
  async updateMyHorario(data: any) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.put<any>(`${this.apiUrl}/barberia/my/horario`, data, { headers })
    );
  }

  // Obtener perfil del usuario 
  async getMyProfile() {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.get<any>(`${this.apiUrl}/user/profile`, { headers })
    );
  }

  // Actualizar perfil del usuario
  async updateMyProfile(data: any) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.put<any>(`${this.apiUrl}/user/profile`, data, { headers })
    );
  }

  // Crear un nuevo servicio
  async addServicio(barberiaId: string, data: any) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.post<any>(`${this.apiUrl}/barberia/${barberiaId}/servicios`, data, { headers })
    );
  }

  // Obtener detalle de un barbero por ID (requiere autenticación)
  async getBarberoById(barberoId: string) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.get<any>(`${this.apiUrl}/barbero/${barberoId}`, { headers })
    );
  }

  // Actualizar datos de un barbero por ID (requiere autenticación)
  async updateBarbero(barberoId: string, data: any) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.put<any>(`${this.apiUrl}/barbero/${barberoId}`, data, { headers })
    );
  }

  // Eliminar un servicio
  async deleteServicio(barberiaId: string, servicioId: string) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.delete<any>(`${this.apiUrl}/barberia/${barberiaId}/servicios/${servicioId}`, { headers })
    );
  }
}