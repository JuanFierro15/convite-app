import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { ArrivalSnapshot } from './arrival.models';
import { ArrivalSessionService } from './arrival-session.service';
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
    syncing: ReturnType<typeof signal<boolean>>;
    notices: ReturnType<typeof signal<unknown[]>>;
    changes: ReturnType<typeof signal<{ eventId: string; version: number } | null>>;
    dismissNotices: ReturnType<typeof vi.fn>;
  };
  let mockNetwork: {
    online: ReturnType<typeof signal<boolean>>;
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
      syncing: signal(false),
      notices: signal([]),
      changes: signal(null),
      dismissNotices: vi.fn(),
    };

    mockNetwork = {
      online: signal(true),
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

  it('stale signal detects lists older than 12 hours', async () => {
    const oldSnapshot: ArrivalSnapshot = {
      ...testSnapshot,
      downloadedAt: new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString(),
    };
    mockStore.read.mockResolvedValue({ snapshot: oldSnapshot, pending: [] });
    mockSync.refreshSnapshot.mockResolvedValue(oldSnapshot);

    await sessionService.open('event-1');
    expect(sessionService.stale()).toBe(true);
  });
});
