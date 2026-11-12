import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cameraOutline } from 'ionicons/icons';

@Component({
  selector: 'app-camera-permission-notice',
  standalone: true,
  imports: [IonButton, IonIcon],
  templateUrl: './camera-permission-notice.component.html',
  styleUrls: ['./camera-permission-notice.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CameraPermissionNoticeComponent {
  readonly kind = input.required<'denied' | 'permanently-denied'>();
  readonly purpose = input.required<string>();
  readonly showGalleryOption = input<boolean>(false);

  readonly retry = output<void>();
  readonly openSettings = output<void>();
  readonly chooseGallery = output<void>();

  constructor() {
    addIcons({ cameraOutline });
  }
}
