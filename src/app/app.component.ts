import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { ConnectionBannerComponent } from './shared';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet, ConnectionBannerComponent],
})
export class AppComponent {
  constructor() {}
}
