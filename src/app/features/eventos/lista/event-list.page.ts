import { Component } from '@angular/core';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';

@Component({
  selector: 'app-event-list',
  templateUrl: 'event-list.page.html',
  styleUrls: ['event-list.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent],
})
export class EventListPage {}
