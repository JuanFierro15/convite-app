import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { ArrivalStoreService } from './arrival-store.service';
import { ArrivalSyncService } from './arrival-sync.service';
import { ArrivalsRepository } from './arrivals.repository';
import { NetworkStatusService } from './network-status.service';

describe('ArrivalSyncService', () => {
  let syncService: ArrivalSyncService;
  let mockStore: {
    read: ReturnType<typeof vi.fn>;
    mutate: ReturnType<typeof vi.fn>;
    eventIdsWithPending: ReturnType<typeof vi.fn>;
    pendingTotal: ReturnType<typeof vi.fn>;
  };
  let mockRepo: {
    record: ReturnType<typeof vi.fn>;
    download: ReturnType<typeof vi.fn>;
  };
  let mockNetwork: {
    online: ReturnType<typeof signal<boolean>>;
    onReconnect: ReturnType<typeof vi.fn>;
  };
  let mockAuth: {
    session: ReturnType<typeof signal<unknown>>;
    user: ReturnType<typeof signal<unknown>>;
    tryRestoreSession: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockStore = {
      read: vi.fn().mockResolvedValue({ snapshot: null, pending: [] }),
      mutate: vi.fn().mockImplementation((_id, fn) =>
        fn({ snapshot: null, pending: [] }),
      ),
      eventIdsWithPending: vi.fn().mockResolvedValue([]),
      pendingTotal: vi.fn().mockResolvedValue(0),
    };

    mockRepo = {
      record: vi.fn().mockResolvedValue([]),
      download: vi.fn().mockResolvedValue({
        version: 1,
        eventId: 'event-1',
        userId: 'user-1',
        downloadedAt: '2026-11-29T10:00:00-05:00',
        event: { id: 'event-1', name: 'Test', theme_id: 'default', starts_at: '2026-11-29' },
        invitations: [],
      }),
    };

    mockNetwork = {
      online: signal(true),
      onReconnect: vi.fn().mockReturnValue(() => {}),
    };

    mockAuth = {
      session: signal({ user: { id: 'user-1' } }),
      user: signal({ id: 'user-1' }),
      tryRestoreSession: vi.fn().mockResolvedValue(true),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: ArrivalStoreService, useValue: mockStore },
        { provide: ArrivalsRepository, useValue: mockRepo },
        { provide: NetworkStatusService, useValue: mockNetwork },
        { provide: AuthService, useValue: mockAuth },
      ],
    });

    syncService = TestBed.inject(ArrivalSyncService);
  });

  afterEach(() => {
    syncService.stop();
  });

  it('does nothing when offline or when no session exists', async () => {
    mockNetwork.online.set(false);
    await syncService.syncAll();
    expect(mockRepo.record).not.toHaveBeenCalled();

    mockNetwork.online.set(true);
    mockAuth.session.set(null);
    await syncService.syncAll();
    expect(mockRepo.record).not.toHaveBeenCalled();
  });

  it('syncs pending arrivals, mutates store, and redownloads snapshot when changes occurred', async () => {
    mockStore.read.mockResolvedValueOnce({
      snapshot: {
        version: 1,
        eventId: 'event-1',
        userId: 'user-1',
        downloadedAt: '2026-11-29T10:00:00-05:00',
        event: { id: 'event-1', name: 'Test', theme_id: 'default', starts_at: '2026-11-29' },
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
                arrived_at: null,
                arrived_by: null,
              },
            ],
          },
        ],
      },
      pending: [
        {
          guestId: 'g-1',
          invitationId: 'inv-1',
          arrivedAt: '2026-11-29T15:00:00-05:00',
          recordedBy: 'user-1',
        },
      ],
    }).mockResolvedValue({
      snapshot: null,
      pending: [],
    });

    mockRepo.record.mockResolvedValueOnce([
      { guest_id: 'g-1', status: 'recorded', arrived_at: '2026-11-29T15:00:00-05:00', arrived_by: 'user-1' },
    ]);

    await syncService.syncEvent('event-1');

    expect(mockRepo.record).toHaveBeenCalledWith('event-1', [
      { guest_id: 'g-1', arrived_at: '2026-11-29T15:00:00-05:00' },
    ]);
    expect(mockStore.mutate).toHaveBeenCalled();
    expect(mockRepo.download).toHaveBeenCalledWith('event-1', 'user-1');
    expect(syncService.lastError()).toBeNull();
  });

  it('preserves pending queue and sets lastError when record fails with network error', async () => {
    mockStore.read.mockResolvedValue({
      snapshot: null,
      pending: [
        {
          guestId: 'g-1',
          invitationId: 'inv-1',
          arrivedAt: '2026-11-29T15:00:00-05:00',
          recordedBy: 'user-1',
        },
      ],
    });

    mockRepo.record.mockRejectedValueOnce(new Error('Fallo de conexión'));

    await syncService.syncEvent('event-1');

    expect(syncService.lastError()).toBe('Fallo de conexión');
    // Store mutate was not called because record threw before modifying store
    expect(mockStore.mutate).not.toHaveBeenCalled();
  });

  it('refreshSnapshot downloads and saves fresh snapshot', async () => {
    const snapshot = await syncService.refreshSnapshot('event-1');
    expect(mockRepo.download).toHaveBeenCalledWith('event-1', 'user-1');
    expect(mockStore.mutate).toHaveBeenCalled();
    expect(snapshot.eventId).toBe('event-1');
  });

  it('dismissNotices removes notices matching eventId', () => {
    syncService['noticesSignal'].set([
      {
        eventId: 'event-1',
        guestId: 'g-1',
        fullName: 'Carlos',
        groupName: 'Familia',
        type: 'other_device',
        arrivedAt: null,
        message: 'Aviso',
      },
      {
        eventId: 'event-2',
        guestId: 'g-2',
        fullName: 'Ana',
        groupName: 'Familia 2',
        type: 'not_found',
        arrivedAt: null,
        message: 'Aviso 2',
      },
    ]);

    expect(syncService.notices()).toHaveLength(2);
    syncService.dismissNotices('event-1');
    expect(syncService.notices()).toHaveLength(1);
    expect(syncService.notices()[0].eventId).toBe('event-2');
  });
});
