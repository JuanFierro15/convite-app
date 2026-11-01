import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { ConnectionStatusService } from '../supabase/connection-status.service';
import { ArrivalSnapshot } from './arrival.models';
import {
  ArrivalSessionService,
  LIST_STALE_AFTER_MS,
  isListStale,
} from './arrival-session.service';
import { ArrivalStoreService } from './arrival-store.service';
import { ArrivalSyncService } from './arrival-sync.service';
import { ArrivalsRepository } from './arrivals.repository';
import { NetworkStatusService } from './network-status.service';

const testSnapshot: ArrivalSnapshot = {
  version: 1,
  eventId: 'event-1',
  userId: 'user-1',
  downloadedAt: '2026-11-29T10:00:00-05:00',
  event: {
    id: 'event-1',
    name: 'Baby Shower Ficticio',
    theme_id: 'default',
    starts_at: '2026-11-29T15:00:00-05:00',
  },
  invitations: [
    {
      id: 'inv-1',
      code: 'ABCD2345GH',
      group_name: 'Familia Ramírez',
      kind: 'group',
      guests: [
        {
          id: 'g-1',
          full_name: 'Carlos Ramírez',
          rsvp: 'accepted',
          sort_order: 1,
          arrived_at: '2026-11-29T15:10:00-05:00',
          arrived_by: 'user-1',
        },
        {
          id: 'g-2',
          full_name: 'Lucía Ramírez',
          rsvp: 'accepted',
          sort_order: 2,
          arrived_at: null,
          arrived_by: null,
        },
      ],
    },
  ],
};

describe('ArrivalSessionService', () => {
  let sessionService: ArrivalSessionService;
  let mockStore: {
    read: ReturnType<typeof vi.fn>;
    mutate: ReturnType<typeof vi.fn>;
  };
  let mockRepo: {
    undo: ReturnType<typeof vi.fn>;
  };
  let mockSync: {
    refreshSnapshot: ReturnType<typeof vi.fn>;
    syncEvent: ReturnType<typeof vi.fn>;
    syncAll: ReturnType<typeof vi.fn>;
    syncing: ReturnType<typeof signal<boolean>>;
    lastError: ReturnType<typeof signal<string | null>>;
    notices: ReturnType<typeof signal<unknown[]>>;
    changes: ReturnType<typeof signal<{ eventId: string; version: number } | null>>;
    dismissNotices: ReturnType<typeof vi.fn>;
  };
  let mockNetwork: {
    online: ReturnType<typeof signal<boolean>>;
  };
  let mockConnectionStatus: {
    retrying: ReturnType<typeof signal<boolean>>;
    slow: ReturnType<typeof signal<boolean>>;
    unreachable: ReturnType<typeof signal<boolean>>;
  };
  let mockAuth: {
    session: ReturnType<typeof signal<unknown>>;
    user: ReturnType<typeof signal<{ id: string } | null>>;
    lastKnownUser: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    let currentState: { snapshot: ArrivalSnapshot | null; pending: any[] } = {
      snapshot: testSnapshot,
      pending: [],
    };

    mockStore = {
      read: vi.fn().mockImplementation(async () => ({
        snapshot: currentState.snapshot,
        pending: [...currentState.pending],
      })),
      mutate: vi.fn().mockImplementation(async (_id, fn) => {
        const outcome = await fn(currentState);
        if (outcome.snapshot !== undefined) {
          currentState.snapshot = outcome.snapshot;
        }
        if (outcome.pending !== undefined) {
          currentState.pending = outcome.pending;
        }
        return outcome.result;
      }),
    };

    mockRepo = {
      undo: vi.fn().mockResolvedValue(undefined),
    };

    mockSync = {
      refreshSnapshot: vi.fn().mockResolvedValue(testSnapshot),
      syncEvent: vi.fn().mockResolvedValue(undefined),
      syncAll: vi.fn().mockResolvedValue(undefined),
      syncing: signal(false),
      lastError: signal<string | null>(null),
      notices: signal([]),
      changes: signal(null),
      dismissNotices: vi.fn(),
    };

    mockNetwork = {
      online: signal(true),
    };

    mockConnectionStatus = {
      retrying: signal(false),
      slow: signal(false),
      unreachable: signal(false),
    };

    mockAuth = {
      session: signal({ user: { id: 'user-1' } }),
      user: signal({ id: 'user-1' }),
      lastKnownUser: vi.fn().mockResolvedValue({ id: 'user-1', email: 'test@convite.test', displayName: 'Test' }),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: ArrivalStoreService, useValue: mockStore },
        { provide: ArrivalsRepository, useValue: mockRepo },
        { provide: ArrivalSyncService, useValue: mockSync },
        { provide: NetworkStatusService, useValue: mockNetwork },
        { provide: ConnectionStatusService, useValue: mockConnectionStatus },
        { provide: AuthService, useValue: mockAuth },
      ],
    });

    sessionService = TestBed.inject(ArrivalSessionService);
  });

  it('open reads local store and refreshes snapshot when online and authenticated', async () => {
    await sessionService.open('event-1');

    expect(sessionService.eventId()).toBe('event-1');
    expect(sessionService.snapshot()).toEqual(testSnapshot);
    expect(mockSync.refreshSnapshot).toHaveBeenCalledWith('event-1');
    expect(sessionService.loading()).toBe(false);
    expect(sessionService.refreshing()).toBe(false);
  });

  it('open preserves local list and sets error when refresh fails', async () => {
    mockSync.refreshSnapshot.mockRejectedValueOnce(new Error('Fallo al actualizar'));

    await sessionService.open('event-1');

    expect(sessionService.snapshot()).toEqual(testSnapshot);
    expect(sessionService.error()).toBe('Fallo al actualizar');
    expect(sessionService.refreshing()).toBe(false);
  });

  it('prefetch downloads and saves snapshot silently', async () => {
    await sessionService.prefetch('event-1');
    expect(mockSync.refreshSnapshot).toHaveBeenCalledWith('event-1');

    mockSync.refreshSnapshot.mockRejectedValueOnce(new Error('Error de red'));
    await expect(sessionService.prefetch('event-1')).resolves.toBeUndefined();
  });

  it('register enqueues arrivals and calls sync.syncEvent without blocking', async () => {
    await sessionService.open('event-1');

    const added = await sessionService.register('inv-1', ['g-2']);
    expect(added).toBe(1);
    expect(mockStore.mutate).toHaveBeenCalled();
    expect(mockSync.syncEvent).toHaveBeenCalledWith('event-1');
    expect(sessionService.pendingCount()).toBe(1);
  });

  it('undo removes from local pending queue without network call when guest is pending', async () => {
    await sessionService.open('event-1');
    await sessionService.register('inv-1', ['g-2']);

    mockNetwork.online.set(false); // Can undo pending offline
    await sessionService.undo('g-2');

    expect(mockRepo.undo).not.toHaveBeenCalled();
    expect(sessionService.pendingCount()).toBe(0);
  });

  it('undo throws error if synced arrival is undone without connection', async () => {
    await sessionService.open('event-1');
    mockNetwork.online.set(false);

    await expect(sessionService.undo('g-1')).rejects.toThrow(
      'Para deshacer una llegada ya sincronizada necesitas conexión.',
    );
    expect(mockRepo.undo).not.toHaveBeenCalled();
  });

  it('undo calls repository.undo and clears arrival in snapshot when online', async () => {
    await sessionService.open('event-1');
    mockNetwork.online.set(true);

    await sessionService.undo('g-1');
    expect(mockRepo.undo).toHaveBeenCalledWith('g-1');
    expect(mockStore.mutate).toHaveBeenCalled();
  });

  it('stale signal detects lists older than 60 minutes', async () => {
    const recentSnapshot: ArrivalSnapshot = {
      ...testSnapshot,
      downloadedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    };
    mockStore.read.mockResolvedValue({ snapshot: recentSnapshot, pending: [] });
    mockSync.refreshSnapshot.mockResolvedValue(recentSnapshot);

    await sessionService.open('event-1');
    expect(sessionService.stale()).toBe(false);

    const staleSnapshot: ArrivalSnapshot = {
      ...testSnapshot,
      downloadedAt: new Date(Date.now() - 65 * 60 * 1000).toISOString(),
    };
    mockStore.read.mockResolvedValue({ snapshot: staleSnapshot, pending: [] });
    mockSync.refreshSnapshot.mockResolvedValue(staleSnapshot);

    await sessionService.open('event-1');
    expect(sessionService.stale()).toBe(true);
  });

  describe('connection signal', () => {
    it('returns online when network is online and server is reachable with no slow/retry requests', async () => {
      mockNetwork.online.set(true);
      mockConnectionStatus.unreachable.set(false);
      mockConnectionStatus.retrying.set(false);
      mockConnectionStatus.slow.set(false);

      expect(sessionService.connection()).toBe('online');
    });

    it('returns slow when retrying or slow is true', async () => {
      mockNetwork.online.set(true);
      mockConnectionStatus.unreachable.set(false);

      mockConnectionStatus.retrying.set(true);
      mockConnectionStatus.slow.set(false);
      expect(sessionService.connection()).toBe('slow');

      mockConnectionStatus.retrying.set(false);
      mockConnectionStatus.slow.set(true);
      expect(sessionService.connection()).toBe('slow');
    });

    it('returns offline when device is offline regardless of server status', async () => {
      mockNetwork.online.set(false);
      mockConnectionStatus.unreachable.set(false);
      mockConnectionStatus.retrying.set(false);
      mockConnectionStatus.slow.set(false);

      expect(sessionService.connection()).toBe('offline');
    });

    it('returns offline when device is online but server is unreachable', async () => {
      mockNetwork.online.set(true);
      mockConnectionStatus.unreachable.set(true);

      expect(sessionService.connection()).toBe('offline');
    });
  });

  describe('syncError and retrySync', () => {
    it('syncError reflects sync.lastError()', () => {
      expect(sessionService.syncError()).toBeNull();
      mockSync.lastError.set('Error al sincronizar');
      expect(sessionService.syncError()).toBe('Error al sincronizar');
    });

    it('retrySync calls sync.syncAll()', async () => {
      await sessionService.retrySync();
      expect(mockSync.syncAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('downloadedAt signal', () => {
    it('returns snapshot downloadedAt or null', async () => {
      expect(sessionService.downloadedAt()).toBeNull();
      await sessionService.open('event-1');
      expect(sessionService.downloadedAt()).toBe(testSnapshot.downloadedAt);
    });
  });

  describe('isListStale', () => {
    const fixedNow = new Date('2026-11-29T15:00:00-05:00');

    it('exports LIST_STALE_AFTER_MS as 60 minutes in ms', () => {
      expect(LIST_STALE_AFTER_MS).toBe(60 * 60 * 1000);
    });

    it('returns false when downloadedAtIso is null or invalid', () => {
      expect(isListStale(null, fixedNow)).toBe(false);
      expect(isListStale('fecha-invalida', fixedNow)).toBe(false);
    });

    it('returns false when downloaded within 60 minutes or exactly 60 minutes ago', () => {
      const thirtyMinAgo = new Date(fixedNow.getTime() - 30 * 60 * 1000).toISOString();
      expect(isListStale(thirtyMinAgo, fixedNow)).toBe(false);

      const exactlySixtyMinAgo = new Date(fixedNow.getTime() - 60 * 60 * 1000).toISOString();
      expect(isListStale(exactlySixtyMinAgo, fixedNow)).toBe(false);
    });

    it('returns true when downloaded more than 60 minutes ago', () => {
      const sixtyOneMinAgo = new Date(fixedNow.getTime() - 61 * 60 * 1000).toISOString();
      expect(isListStale(sixtyOneMinAgo, fixedNow)).toBe(true);

      const twoHoursAgo = new Date(fixedNow.getTime() - 120 * 60 * 1000).toISOString();
      expect(isListStale(twoHoursAgo, fixedNow)).toBe(true);
    });

    it('returns false when date is in the future', () => {
      const future = new Date(fixedNow.getTime() + 10 * 60 * 1000).toISOString();
      expect(isListStale(future, fixedNow)).toBe(false);
    });
  });
});
