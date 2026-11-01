import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  viewChild,
} from '@angular/core';
import { ConnectionStatusService } from '../../../core';

@Component({
  selector: 'app-connection-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // La región role="status" queda siempre en el DOM: si se insertara ya con
  // el texto, algunos lectores de pantalla no anunciarían el aviso.
  template: `
    <div
      #banner
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
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  readonly banner = viewChild.required<ElementRef<HTMLElement>>('banner');

  readonly visible = computed<boolean>(
    () => this.connectionStatus.retrying() || this.connectionStatus.slow(),
  );

  readonly message = computed<string>(() =>
    this.visible() ? 'La conexión está lenta, reintentando...' : '',
  );

  private resizeObserver: ResizeObserver | null = null;
  private isDestroyed = false;

  constructor() {
    effect(() => {
      const isVisible = this.visible();
      if (isVisible) {
        this.document.documentElement.classList.add('connection-banner-active');
        afterNextRender(
          () => {
            if (!this.isDestroyed && this.visible()) {
              this.updateBannerHeight();
              this.startObserving();
            }
          },
          { injector: this.injector },
        );
      } else {
        this.stopObserving();
        this.document.documentElement.classList.remove('connection-banner-active');
        this.document.documentElement.style.removeProperty('--convite-banner-height');
      }
    });

    this.destroyRef.onDestroy(() => {
      this.isDestroyed = true;
      this.stopObserving();
      this.document.documentElement.classList.remove('connection-banner-active');
      this.document.documentElement.style.removeProperty('--convite-banner-height');
    });
  }

  private updateBannerHeight(): void {
    if (!this.visible()) {
      return;
    }
    const element = this.banner().nativeElement;
    const height = Math.ceil(element.getBoundingClientRect().height);
    this.document.documentElement.style.setProperty(
      '--convite-banner-height',
      `${height}px`,
    );
  }

  private startObserving(): void {
    if (this.resizeObserver || typeof ResizeObserver === 'undefined') {
      return;
    }
    this.resizeObserver = new ResizeObserver(() => {
      this.updateBannerHeight();
    });
    this.resizeObserver.observe(this.banner().nativeElement);
  }

  private stopObserving(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }
}
