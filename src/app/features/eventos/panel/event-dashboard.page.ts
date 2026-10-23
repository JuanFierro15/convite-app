import { Component } from '@angular/core';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';

@Component({
  selector: 'app-event-dashboard',
  templateUrl: 'event-dashboard.page.html',
  styleUrls: ['event-dashboard.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent],
})
export class EventDashboardPage {}
