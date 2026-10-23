import { Component } from '@angular/core';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';

@Component({
  selector: 'app-event-form',
  templateUrl: 'event-form.page.html',
  styleUrls: ['event-form.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent],
})
export class EventFormPage {}
