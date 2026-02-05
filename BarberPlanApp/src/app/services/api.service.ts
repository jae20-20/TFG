//manejar http genericas
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private apiUrl = 'http://localhost:5050';

  constructor(private http: HttpClient) {}

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
}