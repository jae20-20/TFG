//manejar http genericas
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';
import { firstValueFrom } from 'rxjs';
import { AccionEstadoCita } from './cita-estado.util';

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
    return this.http.post(`${this.apiUrl}/usuarios/login`, { correo, pw});
  }

  // Método para registro de usuario
  register(data: any) {
    return this.http.post(`${this.apiUrl}/usuarios/registro`, data);
  }

  // Método para registro de barbería + admin
  registerBarberia(data: any) {
    return this.http.post(`${this.apiUrl}/barberias/registro`, data);
  }

  // Validar código de invitación de empleado (paso 1 del registro de barbero)
  async validateInvitationCode(code: string) {
    return await firstValueFrom(
      this.http.post<any>(`${this.apiUrl}/barberias/invitaciones/validar`, { code })
    );
  }

  // --- INVITACIONES DE EMPLEADOS (ADMIN) ---

  // Crear invitación para un nuevo empleado (devuelve el código en claro una única vez)
  async createInvitacion(data: { nombre: string; apellido: string; cargo: string }) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.post<any>(`${this.apiUrl}/barberias/invitaciones`, data, { headers })
    );
  }

  // Listar invitaciones de la barbería del admin autenticado
  async getInvitaciones() {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/barberias/invitaciones`, { headers })
    );
  }

  // Regenerar el código de una invitación pendiente
  async regenerarInvitacion(invitacionId: string) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.post<any>(`${this.apiUrl}/barberias/invitaciones/${invitacionId}/regenerar`, {}, { headers })
    );
  }

  // Revocar una invitación pendiente
  async revocarInvitacion(invitacionId: string) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.put<any>(`${this.apiUrl}/barberias/invitaciones/${invitacionId}/revocar`, {}, { headers })
    );
  }

  // Eliminar una invitación del listado
  async deleteInvitacion(invitacionId: string) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.delete<any>(`${this.apiUrl}/barberias/invitaciones/${invitacionId}`, { headers })
    );
  }

  // Obtener barberías públicas para clientes
  async getBarberias() {
    return await firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/barberias`)
    );
  }

  // Obtener detalle de barbería pública
  async getBarberia(barberiaId: string) {
    return await firstValueFrom(
      this.http.get<any>(`${this.apiUrl}/barberias/${barberiaId}`)
    );
  }

  // Obtener servicios públicos de una barbería
  async getServiciosBarberia(barberiaId: string) {
    return await firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/barberias/${barberiaId}/servicios`)
    );
  }

  // Obtener barberos de una barbería (público; con sesión de admin devuelve los datos completos)
  async getBarberosBarberia(barberiaId: string) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/barberias/${barberiaId}/barberos`, { headers })
    );
  }

  // Obtener disponibilidad pública de un barbero en fecha
  // incluirEnCurso: el personal puede registrar a quien llega sin cita en el hueco que ya empezó
  // duracion: minutos totales de los servicios elegidos, para ofrecer solo las horas en las que caben
  async getDisponibilidadBarbero(barberoId: string, fecha: string, barberiaId: string, incluirEnCurso = false, duracion?: number) {
    const params: Record<string, string> = { barberiaId };
    if (incluirEnCurso) params['incluirEnCurso'] = 'true';
    if (duracion) params['duracion'] = String(duracion);
    return await firstValueFrom(
      this.http.get<any>(`${this.apiUrl}/citas/disponibilidad/${barberoId}/${fecha}`, { params })
    );
  }

  // Días de un mes (YYYY-MM) en los que el barbero tiene hueco para la duración indicada
  async getDiasDisponibles(barberoId: string, mes: string, barberiaId: string, duracion?: number) {
    const params: Record<string, string> = { barberiaId };
    if (duracion) params['duracion'] = String(duracion);
    return await firstValueFrom(
      this.http.get<{ mes: string; dias: string[] }>(`${this.apiUrl}/citas/disponibilidad/${barberoId}/mes/${mes}`, { params })
    );
  }

  // Obtener mis citas (cliente autenticado)
  async getMisCitas() {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/citas/mis-citas`, { headers })
    );
  }

  // Crear cita (cliente autenticado)
  async crearCita(data: {
    barberiaId: string;
    barberoId: string;
    servicioIds: string[];
    fecha: string;
    horaInicio: string;
    comentario?: string;
  }) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.post<any>(`${this.apiUrl}/citas`, data, { headers })
    );
  }

  // Crear cita manual (admin o barbero)
  async crearCitaManual(data: {
    barberoId: string;
    servicioIds: string[];
    fecha: string;
    horaInicio: string;
    clienteNombre?: string;
  }) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.post<any>(`${this.apiUrl}/citas/manual`, data, { headers })
    );
  }

  // Obtener citas de una barbería 
  async getCitasBarberia(barberiaId: string) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/citas/barberia/${barberiaId}`, { headers })
    );
  }

  async getAnaliticasBarberia(barberiaId: string, periodo: 'dia' | 'semana' | 'mes', fecha: string) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.get<any>(`${this.apiUrl}/citas/barberia/${barberiaId}/analiticas`, {
        headers,
        params: { periodo, fecha }
      })
    );
  }

  // Obtener citas del barbero autenticado
  async getCitasBarbero() {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/citas/barbero`, { headers })
    );
  }

  // Actualizar estado de pago e importe de una cita
  async updateCitaPago(id: string, pagado: boolean, importePagado: number) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.put<any>(`${this.apiUrl}/citas/${id}/pago`, { pagado, importePagado }, { headers })
    );
  }

  // Aceptar o rechazar una reserva pendiente, o registrar la asistencia a una cita
  async cambiarEstadoCita(id: string, accion: AccionEstadoCita) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.put<any>(`${this.apiUrl}/citas/${id}/${accion}`, {}, { headers })
    );
  }

  // Cancelar una cita
  async cancelarCita(id: string) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.put<any>(`${this.apiUrl}/citas/${id}/cancelar`, {}, { headers })
    );
  }

  // Obtener la barbería completa asociada al admin autenticado
  async getMyBarberia() {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.get<any>(`${this.apiUrl}/barberias/mi/barberia`, { headers })
    );
  }

  // Obtener el horario estructurado de la barbería autenticada
  async getMyHorario() {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.get<any>(`${this.apiUrl}/barberias/mi/horario`, { headers })
    );
  }

  // Actualizar datos de la barbería
  async updateBarberia(barberiaId: string, data: any) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.put<any>(`${this.apiUrl}/barberias/${barberiaId}`, data, { headers })
    );
  }

  // Actualizar el horario estructurado de la barbería autenticada
  async updateMyHorario(data: any) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.put<any>(`${this.apiUrl}/barberias/mi/horario`, data, { headers })
    );
  }

  // Obtener perfil del usuario 
  async getMyProfile() {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.get<any>(`${this.apiUrl}/usuarios/perfil`, { headers })
    );
  }

  // Actualizar perfil del usuario
  async updateMyProfile(data: any) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.put<any>(`${this.apiUrl}/usuarios/perfil`, data, { headers })
    );
  }

  // Crear un nuevo servicio
  async addServicio(barberiaId: string, data: any) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.post<any>(`${this.apiUrl}/barberias/${barberiaId}/servicios`, data, { headers })
    );
  }

  // Obtener detalle de un barbero por ID (requiere autenticación)
  async getBarberoById(barberoId: string) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.get<any>(`${this.apiUrl}/usuarios/${barberoId}`, { headers })
    );
  }

  // Actualizar datos de un barbero por ID (requiere autenticación)
  async updateBarbero(barberoId: string, data: any) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.put<any>(`${this.apiUrl}/barberos/${barberoId}`, data, { headers })
    );
  }

  // Eliminar (desvincular) un barbero de la barbería
  async removeBarbero(barberiaId: string, barberoId: string) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.delete<any>(`${this.apiUrl}/barberias/${barberiaId}/barberos/${barberoId}`, { headers })
    );
  }

  // Eliminar un servicio
  async deleteServicio(barberiaId: string, servicioId: string) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.delete<any>(`${this.apiUrl}/barberias/${barberiaId}/servicios/${servicioId}`, { headers })
    );
  }

  // El barbero vuelve a ofrecer un servicio que tenía bloqueado (no requiere solicitud)
  async desbloquearMiServicio(servicioId: string) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.delete<any>(`${this.apiUrl}/barberos/mi/servicios-bloqueados/${servicioId}`, { headers })
    );
  }

  // --- SOLICITUDES (BARBERO) ---
  async createSolicitud(data: any) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.post<any>(`${this.apiUrl}/solicitudes`, data, { headers })
    );
  }

  async getMisSolicitudes() {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.get<any>(`${this.apiUrl}/solicitudes/mis-solicitudes`, { headers })
    );
  }

  async deleteSolicitud(id: string) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.delete<any>(`${this.apiUrl}/solicitudes/${id}`, { headers })
    );
  }

  // --- SOLICITUDES (ADMIN) ---
  async getSolicitudesEquipo() {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.get<any>(`${this.apiUrl}/solicitudes/equipo`, { headers })
    );
  }

  async responderSolicitud(id: string, estado: string, respuestaAdmin?: string) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.put<any>(`${this.apiUrl}/solicitudes/${id}/responder`, { estado, respuestaAdmin }, { headers })
    );
  }

  // --- RESEÑAS ---

  // Dejar una reseña sobre una cita pasada (cliente autenticado)
  async crearResena(citaId: string, data: { valoracion: number; comentario?: string; imagen?: string | null }) {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.post<any>(`${this.apiUrl}/citas/${citaId}/resena`, data, { headers })
    );
  }

  // Obtener las reseñas de la barbería del admin/barbero autenticado
  async getResenasMiBarberia() {
    const headers = await this.getAuthHeaders();
    return await firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/citas/resenas/barberia`, { headers })
    );
  }

  // Obtener las reseñas públicas de una barbería
  async getResenasBarberia(barberiaId: string) {
    return await firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/barberias/${barberiaId}/resenas`)
    );
  }
}