import { Component } from '@angular/core';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';

@Component({
  selector: 'app-invitation-detail',
  templateUrl: 'invitation-detail.page.html',
  styleUrls: ['invitation-detail.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent],
})
export class InvitationDetailPage {}
