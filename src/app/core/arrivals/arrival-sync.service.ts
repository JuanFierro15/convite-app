import {
  EffectRef,
  Injectable,
  Injector,
  Signal,
  effect,
  inject,
  signal,
} from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { AuthService } from '../auth/auth.service';
import { applyRecordResults } from './arrival-logic';
import {
  ArrivalNotice,
  ArrivalSnapshot,
  RecordArrivalResult,
} from './arrival.models';
import { ArrivalStoreService } from './arrival-store.service';
import { ArrivalsRepository } from './arrivals.repository';
import { NetworkStatusService } from './network-status.service';

@Injectable({ providedIn: 'root' })
export class ArrivalSyncService {
  private readonly store = inject(ArrivalStoreService);
  private readonly repository = inject(ArrivalsRepository);
  private readonly network = inject(NetworkStatusService);
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);

  private readonly syncingSignal = signal<boolean>(false);
  readonly syncing: Signal<boolean> = this.syncingSignal.asReadonly();

  private readonly lastErrorSignal = signal<string | null>(null);
  readonly lastError: Signal<string | null> = this.lastErrorSignal.asReadonly();

  private readonly noticesSignal = signal<ArrivalNotice[]>([]);
  readonly notices: Signal<ArrivalNotice[]> = this.noticesSignal.asReadonly();

  private readonly changesSignal = signal<{ eventId: string; version: number } | null>(null);
  readonly changes: Signal<{ eventId: string; version: number } | null> =
    this.changesSignal.asReadonly();

  private isRunning = false;
  private rerunSyncAll = false;
  private readonly requestedEventIds = new Set<string>();

  private started = false;
  private unsubscribeReconnect: (() => void) | null = null;
  private resumePluginHandle: { remove: () => Promise<void> } | null = null;
  private authEffectRef: EffectRef | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    this.unsubscribeReconnect = this.network.onReconnect(async () => {
      await this.auth.tryRestoreSession();
      void this.syncAll();
    });

    if (Capacitor.isNativePlatform()) {
      void App.addListener('resume', () => {
        void this.syncAll();
      }).then((handle) => {
        this.resumePluginHandle = handle;
      });
    }

    let previousHadSession = this.auth.session() !== null;
    this.authEffectRef = effect(
      () => {
        const hasSession = this.auth.session() !== null;
        if (!previousHadSession && hasSession) {
          void this.syncAll();
        }
        previousHadSession = hasSession;
      },
      { injector: this.injector, manualCleanup: true },
    );

    this.intervalId = setInterval(async () => {
      try {
        const total = await this.store.pendingTotal();
        if (total > 0) {
          void this.syncAll();
        }
      } catch {
        // Ignorar errores al verificar cola en el temporizador
      }
    }, 30_000);
  }

  stop(): void {
    this.started = false;

    if (this.unsubscribeReconnect) {
      this.unsubscribeReconnect();
      this.unsubscribeReconnect = null;
    }

    if (this.resumePluginHandle) {
      void this.resumePluginHandle.remove();
      this.resumePluginHandle = null;
    }

    if (this.authEffectRef) {
      this.authEffectRef.destroy();
      this.authEffectRef = null;
    }

    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async syncAll(): Promise<void> {
    if (!this.network.online() || !this.auth.session()) {
      return;
    }

    if (this.isRunning) {
      this.rerunSyncAll = true;
      return;
    }

    await this.runLoop(true);
  }

  async syncEvent(eventId: string): Promise<void> {
    if (!this.network.online() || !this.auth.session()) {
      return;
    }

    if (this.isRunning) {
      this.requestedEventIds.add(eventId);
      return;
    }

    this.requestedEventIds.add(eventId);
    await this.runLoop(false);
  }

  async refreshSnapshot(eventId: string): Promise<ArrivalSnapshot> {
    const userId = this.auth.user()?.id;
    if (!userId) {
      throw new Error('No hay sesión activa.');
    }

    const snapshot = await this.repository.download(eventId, userId);
    await this.store.mutate(eventId, () => ({
      snapshot,
      result: undefined,
    }));
    this.notifyChanges(eventId);
    return snapshot;
  }

  dismissNotices(eventId: string): void {
    this.noticesSignal.update((list) => list.filter((notice) => notice.eventId !== eventId));
  }

  private async runLoop(initialSyncAll: boolean): Promise<void> {
    this.isRunning = true;
    this.syncingSignal.set(true);
    this.rerunSyncAll = initialSyncAll;

    try {
      while (
        this.network.online() &&
        this.auth.session() &&
        (this.rerunSyncAll || this.requestedEventIds.size > 0)
      ) {
        if (this.rerunSyncAll) {
          this.rerunSyncAll = false;
          this.requestedEventIds.clear();
          const eventIds = await this.store.eventIdsWithPending();
          for (const id of eventIds) {
            if (!this.network.online() || !this.auth.session()) {
              break;
            }
            await this.processEvent(id);
          }
        } else {
          const [id] = this.requestedEventIds;
          this.requestedEventIds.delete(id);
          await this.processEvent(id);
        }
      }
    } finally {
      this.isRunning = false;
      this.syncingSignal.set(false);
    }
  }

  private async processEvent(eventId: string): Promise<void> {
    const currentUserId = this.auth.user()?.id;
    if (!currentUserId) {
      return;
    }

    let hadChanges = false;
    // Si el servidor no devolviera resultado para alguna entrada, sin esto se reenviaría el mismo lote sin fin.
    const attempted = new Set<string>();

    while (this.network.online() && this.auth.session()) {
      const { pending } = await this.store.read(eventId);
      const userPending = pending.filter(
        (item) => item.recordedBy === currentUserId && !attempted.has(item.guestId),
      );
      if (userPending.length === 0) {
        break;
      }

      const batch = userPending.slice(0, 100);
      for (const item of batch) {
        attempted.add(item.guestId);
      }
      const items = batch.map((item) => ({
        guest_id: item.guestId,
        arrived_at: item.arrivedAt,
      }));

      let results: RecordArrivalResult[];
      try {
        results = await this.repository.record(eventId, items);
        this.lastErrorSignal.set(null);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.lastErrorSignal.set(msg);
        return;
      }

      hadChanges = true;

      const newNotices = await this.store.mutate(eventId, (state) => {
        const applied = applyRecordResults(
          state.snapshot,
          state.pending,
          results,
          currentUserId,
          eventId,
        );
        return {
          snapshot: applied.snapshot,
          pending: applied.pending,
          result: applied.notices,
        };
      });

      if (newNotices.length > 0) {
        this.noticesSignal.update((existing) => [...existing, ...newNotices]);
      }

      this.notifyChanges(eventId);
    }

    if (hadChanges && this.network.online() && this.auth.session()) {
      try {
        const freshSnapshot = await this.repository.download(eventId, currentUserId);
        await this.store.mutate(eventId, () => ({
          snapshot: freshSnapshot,
          result: undefined,
        }));
        this.notifyChanges(eventId);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.lastErrorSignal.set(msg);
      }
    }
  }

  private notifyChanges(eventId: string): void {
    this.changesSignal.update((current) => ({
      eventId,
      version: (current?.version ?? 0) + 1,
    }));
  }
}
