import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ConnectionStatusService } from '../../../core';

@Component({
  selector: 'app-connection-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // La región role="status" queda siempre en el DOM: si se insertara ya con
  // el texto, algunos lectores de pantalla no anunciarían el aviso.
  template: `
    <div
      class="connection-banner text-label"
      [class.connection-banner--visible]="visible()"
      role="status"
      aria-live="polite"
    >
      {{ message() }}
    </div>
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
        text-align: center;
        pointer-events: none;
      }

      .connection-banner--visible {
        padding: calc(var(--space-xs) + env(safe-area-inset-top, 0px)) var(--space-md)
          var(--space-xs);
        background-color: var(--ion-color-warning);
        color: var(--ion-color-warning-contrast);
      }
    `,
  ],
})
export class ConnectionBannerComponent {
  private readonly connectionStatus = inject(ConnectionStatusService);

  readonly visible = computed<boolean>(
    () => this.connectionStatus.retrying() || this.connectionStatus.slow(),
  );

  readonly message = computed<string>(() =>
    this.visible() ? 'La conexión está lenta, reintentando...' : '',
  );
}
