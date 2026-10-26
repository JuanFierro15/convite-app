import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { ArrivalSyncService } from './core';
import { ConnectionBannerComponent } from './shared';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet, ConnectionBannerComponent],
})
export class AppComponent {
  private readonly arrivalSync = inject(ArrivalSyncService);

  constructor() {
    this.arrivalSync.start();
  }
}
