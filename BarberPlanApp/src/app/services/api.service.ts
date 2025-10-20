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
  login(email: string, password: string) {
    return this.http.post(`${this.apiUrl}/user/login`, { email, password });
  }

  // Método para registro
  register(data: any) {
    return this.http.post(`${this.apiUrl}/user/register`, data);
  }


}