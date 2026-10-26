import { Injectable, signal } from '@angular/core';
import { ConnectionStatus, Network } from '@capacitor/network';

@Injectable({ providedIn: 'root' })
export class NetworkStatusService {
  private readonly onlineSignal = signal<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  readonly online = this.onlineSignal.asReadonly();

  private readonly reconnectListeners = new Set<() => void>();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.updateStatus(true));
      window.addEventListener('offline', () => this.updateStatus(false));
    }

    void Network.getStatus()
      .then((status) => {
        this.updateStatus(status.connected);
      })
      .catch(() => {});

    void Network.addListener('networkStatusChange', (status: ConnectionStatus) => {
      this.updateStatus(status.connected);
    });
  }

  onReconnect(callback: () => void): () => void {
    this.reconnectListeners.add(callback);
    return () => {
      this.reconnectListeners.delete(callback);
    };
  }

  private updateStatus(connected: boolean): void {
    const wasOnline = this.onlineSignal();
    this.onlineSignal.set(connected);

    if (!wasOnline && connected) {
      for (const listener of this.reconnectListeners) {
        try {
          listener();
        } catch {
          // Ignorar excepciones en los callbacks de reconexión
        }
      }
    }
  }
}
