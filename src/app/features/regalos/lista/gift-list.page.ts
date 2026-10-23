import { Component } from '@angular/core';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';

@Component({
  selector: 'app-gift-list',
  templateUrl: 'gift-list.page.html',
  styleUrls: ['gift-list.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent],
})
export class GiftListPage {}
