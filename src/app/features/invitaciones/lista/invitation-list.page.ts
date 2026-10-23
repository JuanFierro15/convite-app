import { Component } from '@angular/core';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';

@Component({
  selector: 'app-invitation-list',
  templateUrl: 'invitation-list.page.html',
  styleUrls: ['invitation-list.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent],
})
export class InvitationListPage {}
