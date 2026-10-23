import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonButton } from '@ionic/angular';
import { IllustrationComponent, IllustrationName } from '../illustration/illustration.component';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [IllustrationComponent, IonButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty-state">
      <div class="empty-state__illustration">
        <app-illustration [name]="illustration()" [alt]="message()" />
      </div>
      <p class="empty-state__message text-body">{{ message() }}</p>
      @if (actionLabel(); as label) {
        <ion-button fill="outline" color="primary" (click)="action.emit()">
          {{ label }}
        </ion-button>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: var(--space-lg) var(--space-md);
        gap: var(--space-md);
      }

      .empty-state__illustration {
        width: 100%;
        max-width: 220px;
        margin: 0 auto;
      }

      .empty-state__message {
        margin: 0;
        color: var(--ion-color-medium);
      }
    `,
  ],
})
export class EmptyStateComponent {
  readonly message = input.required<string>();
  readonly illustration = input<IllustrationName>('empty-state');
  readonly actionLabel = input<string | null | undefined>(undefined);

  readonly action = output<void>();
}
