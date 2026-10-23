import { Component } from '@angular/core';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';

@Component({
  selector: 'app-guest-invitation',
  templateUrl: 'guest-invitation.page.html',
  styleUrls: ['guest-invitation.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent],
})
export class GuestInvitationPage {}
