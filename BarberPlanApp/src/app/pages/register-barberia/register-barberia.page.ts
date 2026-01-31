import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';

@Component({
  selector: 'app-register-barberia',
  templateUrl: './register-barberia.page.html',
  styleUrls: ['./register-barberia.page.scss'],
  standalone: true,
  imports: [IonContent, IonHeader, IonTitle, IonToolbar, CommonModule, FormsModule]
})
export class RegisterBarberiaPage implements OnInit {

  constructor() { }

  ngOnInit() {
  }

}
