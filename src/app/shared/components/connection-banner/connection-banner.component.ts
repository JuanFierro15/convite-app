import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ConnectionStatusService } from '../../../core';

@Component({
  selector: 'app-connection-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div class="connection-banner text-label" role="status" aria-live="polite">
        La conexión está lenta, reintentando...
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        pointer-events: none;
      }

      .connection-banner {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        width: 100%;
        z-index: 10000;
        padding: calc(var(--space-xs) + env(safe-area-inset-top, 0px)) var(--space-md)
          var(--space-xs);
        background-color: var(--ion-color-warning);
        color: var(--ion-color-warning-contrast);
        text-align: center;
        pointer-events: none;
      }
    `,
  ],
})
export class ConnectionBannerComponent {
  private readonly connectionStatus = inject(ConnectionStatusService);

  readonly visible = computed<boolean>(
    () => this.connectionStatus.retrying() || this.connectionStatus.slow(),
  );
}
