import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { addIcons } from 'ionicons';
import { add, addOutline, timeOutline, calendarOutline } from 'ionicons/icons';
import { ApiService } from '../../../../services/api.service';

addIcons({
  'add': add,
  'add-outline': addOutline,
  'time-outline': timeOutline,
  'calendar-outline': calendarOutline
});

@Component({
  selector: 'app-barber-schedule',
  templateUrl: './schedule.page.html',
  styleUrls: ['./schedule.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule]
})
export class SchedulePage implements OnInit {
  loading = true;
  error = '';
  barberProfile: any = null;
  barberiaHorario: any = null;

  scheduleDays = [
    { key: 'mon', label: 'Lunes' },
    { key: 'tue', label: 'Martes' },
    { key: 'wed', label: 'Miércoles' },
    { key: 'thu', label: 'Jueves' },
    { key: 'fri', label: 'Viernes' },
    { key: 'sat', label: 'Sábado' },
    { key: 'sun', label: 'Domingo' }
  ];

  constructor(private apiService: ApiService) {}

  ngOnInit() {
    this.loadScheduleData();
  }

  async loadScheduleData() {
    this.loading = true;
    this.error = '';
    try {
      const [profileRes, horarioRes] = await Promise.all([
        this.apiService.getMyProfile().catch(() => null),
        this.apiService.getMyHorario().catch(() => null)
      ]);

      this.barberProfile = profileRes;
      this.barberiaHorario = horarioRes?.horario || horarioRes?.schedule || horarioRes || null;
    } catch (e) {
      console.error('Error al cargar horario del barbero:', e);
      this.error = 'No se pudo cargar la información de tu horario.';
    } finally {
      this.loading = false;
    }
  }

  isUsingCustomSchedule(): boolean {
    return !!this.barberProfile?.horarioPersonal?.enabled;
  }

  getSlotsForDay(dayKey: string): { start: string; end: string }[] {
    if (this.isUsingCustomSchedule() && this.barberProfile?.horarioPersonal?.weeklyTemplate?.[dayKey]) {
      return this.barberProfile.horarioPersonal.weeklyTemplate[dayKey];
    }
    if (this.barberiaHorario?.weeklyTemplate?.[dayKey]) {
      return this.barberiaHorario.weeklyTemplate[dayKey];
    }
    return [];
  }
}
