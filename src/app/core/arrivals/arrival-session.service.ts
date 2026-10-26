import {
  Injectable,
  Signal,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { ArrivalCounts } from '../utils/arrival-counts';
import { formatDownloadedAt } from '../utils/dates';
import {
  buildInvitationViews,
  countsFromViews,
  enqueueArrivals,
  findInvitationByCode,
  removePending,
  searchInvitations,
} from './arrival-logic';
import {
  ArrivalInvitationView,
  ArrivalNotice,
  ArrivalSnapshot,
  PendingArrival,
} from './arrival.models';
import { ArrivalStoreService } from './arrival-store.service';
import { ArrivalSyncService } from './arrival-sync.service';
import { ArrivalsRepository } from './arrivals.repository';
import { NetworkStatusService } from './network-status.service';

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class ArrivalSessionService {
  private readonly store = inject(ArrivalStoreService);
  private readonly repository = inject(ArrivalsRepository);
  private readonly sync = inject(ArrivalSyncService);
  private readonly network = inject(NetworkStatusService);
  private readonly auth = inject(AuthService);

  private readonly eventIdSignal = signal<string | null>(null);
  readonly eventId: Signal<string | null> = this.eventIdSignal.asReadonly();

  private readonly snapshotSignal = signal<ArrivalSnapshot | null>(null);
  readonly snapshot: Signal<ArrivalSnapshot | null> = this.snapshotSignal.asReadonly();

  private readonly pendingSignal = signal<readonly PendingArrival[]>([]);
  readonly pending: Signal<readonly PendingArrival[]> = this.pendingSignal.asReadonly();

  private readonly loadingSignal = signal<boolean>(false);
  readonly loading: Signal<boolean> = this.loadingSignal.asReadonly();

  private readonly refreshingSignal = signal<boolean>(false);
  readonly refreshing: Signal<boolean> = this.refreshingSignal.asReadonly();

  private readonly errorSignal = signal<string | null>(null);
  readonly error: Signal<string | null> = this.errorSignal.asReadonly();

  readonly invitations: Signal<ArrivalInvitationView[]> = computed(() =>
    buildInvitationViews(this.snapshot(), this.pending()),
  );

  readonly counts: Signal<ArrivalCounts> = computed(() =>
    countsFromViews(this.invitations()),
  );

  readonly pendingCount: Signal<number> = computed(() => this.pending().length);

  readonly online: Signal<boolean> = computed(() => this.network.online());

  readonly hasSession: Signal<boolean> = computed(() => this.auth.session() !== null);

  readonly syncing: Signal<boolean> = computed(() => this.sync.syncing());

  readonly notices: Signal<ArrivalNotice[]> = computed(() => {
    const currentId = this.eventId();
    if (!currentId) {
      return [];
    }
    return this.sync.notices().filter((notice) => notice.eventId === currentId);
  });

  readonly downloadedAtText: Signal<string> = computed(() => {
    const snap = this.snapshot();
    if (!snap) {
      return '';
    }
    return formatDownloadedAt(snap.downloadedAt);
  });

  readonly stale: Signal<boolean> = computed(() => {
    const snap = this.snapshot();
    if (!snap) {
      return false;
    }
    const downloadedTime = new Date(snap.downloadedAt).getTime();
    if (Number.isNaN(downloadedTime)) {
      return false;
    }
    return Date.now() - downloadedTime > TWELVE_HOURS_MS;
  });

  constructor() {
    effect(() => {
      const change = this.sync.changes();
      const currentId = this.eventIdSignal();
      if (change && currentId && change.eventId === currentId) {
        void this.reloadLocal(currentId);
      }
    });
  }

  async open(eventId: string): Promise<void> {
    this.eventIdSignal.set(eventId);
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const state = await this.store.read(eventId);
      this.snapshotSignal.set(state.snapshot);
      this.pendingSignal.set(state.pending);
    } finally {
      this.loadingSignal.set(false);
    }

    await this.refresh();
  }

  async refresh(): Promise<void> {
    const currentId = this.eventIdSignal();
    if (!currentId || !this.network.online() || !this.auth.session()) {
      return;
    }

    this.refreshingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const fresh = await this.sync.refreshSnapshot(currentId);
      this.snapshotSignal.set(fresh);
    } catch (err: unknown) {
      // La pantalla lee el error desde el signal; relanzarlo dejaría promesas sin manejar en los llamados con void.
      const message = err instanceof Error ? err.message : String(err);
      this.errorSignal.set(message);
    } finally {
      this.refreshingSignal.set(false);
    }
  }

  async prefetch(eventId: string): Promise<void> {
    if (!this.network.online() || !this.auth.session()) {
      return;
    }

    try {
      await this.sync.refreshSnapshot(eventId);
    } catch {
      // Prefetch silencioso, nunca lanza
    }
  }

  findByCode(code: string): ArrivalInvitationView | null {
    return findInvitationByCode(this.invitations(), code);
  }

  search(query: string): ArrivalInvitationView[] {
    return searchInvitations(this.invitations(), query);
  }

  async register(invitationId: string, guestIds: readonly string[]): Promise<number> {
    const currentId = this.eventIdSignal();
    if (!currentId) {
      throw new Error('No hay evento abierto.');
    }

    let recordedBy = this.auth.user()?.id;
    if (!recordedBy) {
      const last = await this.auth.lastKnownUser();
      recordedBy = last?.id;
    }

    if (!recordedBy) {
      throw new Error('No pudimos identificar tu usuario. Inicia sesión otra vez.');
    }

    const nowIso = new Date().toISOString();

    const { added, pending, snapshot } = await this.store.mutate<{
      added: number;
      pending: PendingArrival[];
      snapshot: ArrivalSnapshot | null;
    }>(currentId, (state) => {
      const enqueued = enqueueArrivals(
        state.snapshot,
        state.pending,
        invitationId,
        guestIds,
        recordedBy,
        nowIso,
      );
      return {
        pending: enqueued.pending,
        result: {
          added: enqueued.added,
          pending: enqueued.pending,
          snapshot: state.snapshot,
        },
      };
    });

    this.snapshotSignal.set(snapshot);
    this.pendingSignal.set(pending);

    void this.sync.syncEvent(currentId);

    return added;
  }

  async undo(guestId: string): Promise<void> {
    const currentId = this.eventIdSignal();
    if (!currentId) {
      throw new Error('No hay evento abierto.');
    }

    const isPending = this.pendingSignal().some((item) => item.guestId === guestId);

    if (isPending) {
      const { updatedPending, updatedSnapshot } = await this.store.mutate<{
        updatedPending: PendingArrival[];
        updatedSnapshot: ArrivalSnapshot | null;
      }>(currentId, (state) => {
        const nextPending = removePending(state.pending, guestId);
        return {
          pending: nextPending,
          result: {
            updatedPending: nextPending,
            updatedSnapshot: state.snapshot,
          },
        };
      });

      this.pendingSignal.set(updatedPending);
      this.snapshotSignal.set(updatedSnapshot);
      return;
    }

    if (!this.network.online() || !this.auth.session()) {
      throw new Error('Para deshacer una llegada ya sincronizada necesitas conexión.');
    }

    await this.repository.undo(guestId);

    const { updatedSnapshot, updatedPending } = await this.store.mutate<{
      updatedSnapshot: ArrivalSnapshot | null;
      updatedPending: PendingArrival[];
    }>(currentId, (state) => {
      if (!state.snapshot) {
        return {
          result: {
            updatedSnapshot: null,
            updatedPending: state.pending,
          },
        };
      }

      const nextSnapshot: ArrivalSnapshot = {
        ...state.snapshot,
        invitations: state.snapshot.invitations.map((inv) => ({
          ...inv,
          guests: inv.guests.map((guest) =>
            guest.id === guestId
              ? { ...guest, arrived_at: null, arrived_by: null }
              : guest,
          ),
        })),
      };

      return {
        snapshot: nextSnapshot,
        result: {
          updatedSnapshot: nextSnapshot,
          updatedPending: state.pending,
        },
      };
    });

    this.snapshotSignal.set(updatedSnapshot);
    this.pendingSignal.set(updatedPending);
  }

  dismissNotices(): void {
    const currentId = this.eventIdSignal();
    if (currentId) {
      this.sync.dismissNotices(currentId);
    }
  }

  private async reloadLocal(eventId: string): Promise<void> {
    const state = await this.store.read(eventId);
    if (this.eventIdSignal() === eventId) {
      this.snapshotSignal.set(state.snapshot);
      this.pendingSignal.set(state.pending);
    }
  }
}
