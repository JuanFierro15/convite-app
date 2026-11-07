import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon, IonItem, IonLabel } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkCircle, closeCircle, time } from 'ionicons/icons';
import {
  RsvpLogEntry,
  rsvpLogActionText,
  rsvpLogDetailText,
} from '../../../core';

@Component({
  selector: 'app-rsvp-log-item',
  standalone: true,
  templateUrl: './rsvp-log-item.component.html',
  styleUrls: ['./rsvp-log-item.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IonItem, IonIcon, IonLabel],
})
export class RsvpLogItemComponent {
  readonly entry = input.required<RsvpLogEntry>();
  readonly now = input.required<Date>();
  readonly link = input.required<unknown[]>();

  readonly actionText = computed(() => rsvpLogActionText(this.entry()));
  readonly detailText = computed(() => rsvpLogDetailText(this.entry(), this.now()));

  readonly iconName = computed(() => {
    switch (this.entry().rsvp) {
      case 'accepted':
        return 'checkmark-circle';
      case 'declined':
        return 'close-circle';
      default:
        return 'time';
    }
  });

  readonly iconColor = computed(() => {
    switch (this.entry().rsvp) {
      case 'accepted':
        return 'success';
      case 'declined':
        return 'danger';
      default:
        return 'warning';
    }
  });

  readonly ariaLabel = computed(() => {
    const action = this.actionText();
    const detail = this.detailText();
    const base = `${this.entry().guest_name} ${action}.`;
    return detail.length > 0 ? `${base} ${detail}` : base;
  });

  constructor() {
    addIcons({ checkmarkCircle, closeCircle, time });
  }
}
