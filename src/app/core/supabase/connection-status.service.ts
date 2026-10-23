import { Injectable, Signal, computed, signal } from '@angular/core';

export interface RequestTracker {
  markRetrying(): void;
  markSlow(): void;
  finish(): void;
}

@Injectable({ providedIn: 'root' })
export class ConnectionStatusService {
  private readonly retryingCount = signal(0);
  private readonly slowCount = signal(0);

  readonly retrying: Signal<boolean> = computed(() => this.retryingCount() > 0);
  readonly slow: Signal<boolean> = computed(() => this.slowCount() > 0);

  trackRequest(): RequestTracker {
    let markedRetrying = false;
    let markedSlow = false;
    let finished = false;

    return {
      markRetrying: () => {
        if (finished || markedRetrying) {
          return;
        }
        markedRetrying = true;
        this.retryingCount.update((count) => count + 1);
      },
      markSlow: () => {
        if (finished || markedSlow) {
          return;
        }
        markedSlow = true;
        this.slowCount.update((count) => count + 1);
      },
      finish: () => {
        if (finished) {
          return;
        }
        finished = true;
        if (markedRetrying) {
          this.retryingCount.update((count) => Math.max(0, count - 1));
        }
        if (markedSlow) {
          this.slowCount.update((count) => Math.max(0, count - 1));
        }
      },
    };
  }
}
