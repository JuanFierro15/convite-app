import { TestBed } from '@angular/core/testing';
import { ArrivalSnapshot, PendingArrival } from './arrival.models';
import { ArrivalStoreService } from './arrival-store.service';

const sampleSnapshot: ArrivalSnapshot = {
  version: 1,
  eventId: 'event-test-1',
  userId: 'user-organizer',
  downloadedAt: '2026-11-29T10:00:00-05:00',
  event: {
    id: 'event-test-1',
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
          id: 'guest-1',
          full_name: 'Carlos Ramírez',
          rsvp: 'accepted',
          sort_order: 1,
          arrived_at: null,
          arrived_by: null,
        },
      ],
    },
  ],
};

describe('ArrivalStoreService', () => {
  let store: ArrivalStoreService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    store = TestBed.inject(ArrivalStoreService);
  });

  it('reads and writes snapshot and pending queue successfully', async () => {
    const initial = await store.read('event-test-1');
    expect(initial.snapshot).toBeNull();
    expect(initial.pending).toEqual([]);

    const pendingItem: PendingArrival = {
      guestId: 'guest-1',
      invitationId: 'inv-1',
      arrivedAt: '2026-11-29T15:05:00-05:00',
      recordedBy: 'user-organizer',
    };

    const result = await store.mutate('event-test-1', () => ({
      snapshot: sampleSnapshot,
      pending: [pendingItem],
      result: 'saved',
    }));

    expect(result).toBe('saved');

    const loaded = await store.read('event-test-1');
    expect(loaded.snapshot).toEqual(sampleSnapshot);
    expect(loaded.pending).toEqual([pendingItem]);
  });

  it('handles damaged JSON or wrong version gracefully without throwing', async () => {
    localStorage.setItem('convite.arrivals.event-bad.snapshot', '{ invalid JSON');
    localStorage.setItem('convite.arrivals.event-bad.pending', 'not an array');

    const readDamaged = await store.read('event-bad');
    expect(readDamaged.snapshot).toBeNull();
    expect(readDamaged.pending).toEqual([]);

    localStorage.setItem(
      'convite.arrivals.event-version.snapshot',
      JSON.stringify({ version: 2, eventId: 'event-version' }),
    );

    const readVersion = await store.read('event-version');
    expect(readVersion.snapshot).toBeNull();
  });

  it('chains simultaneous mutate calls with Promise.all so both additions persist', async () => {
    const itemA: PendingArrival = {
      guestId: 'guest-A',
      invitationId: 'inv-1',
      arrivedAt: '2026-11-29T15:01:00-05:00',
      recordedBy: 'user-organizer',
    };

    const itemB: PendingArrival = {
      guestId: 'guest-B',
      invitationId: 'inv-1',
      arrivedAt: '2026-11-29T15:02:00-05:00',
      recordedBy: 'user-organizer',
    };

    await Promise.all([
      store.mutate('event-test-1', (state) => ({
        pending: [...state.pending, itemA],
        result: 'A',
      })),
      store.mutate('event-test-1', (state) => ({
        pending: [...state.pending, itemB],
        result: 'B',
      })),
    ]);

    const finalState = await store.read('event-test-1');
    expect(finalState.pending).toHaveLength(2);
    expect(finalState.pending.map((p) => p.guestId)).toEqual(['guest-A', 'guest-B']);
  });

  it('propagates error and writes nothing if mutate function throws', async () => {
    const itemOriginal: PendingArrival = {
      guestId: 'guest-original',
      invitationId: 'inv-1',
      arrivedAt: '2026-11-29T15:00:00-05:00',
      recordedBy: 'user-organizer',
    };

    await store.mutate('event-test-1', () => ({
      pending: [itemOriginal],
      result: 'init',
    }));

    await expect(
      store.mutate('event-test-1', () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const state = await store.read('event-test-1');
    expect(state.pending).toHaveLength(1);
    expect(state.pending[0].guestId).toBe('guest-original');
  });

  it('clearAll deletes all convite.arrivals keys and preserves others', async () => {
    localStorage.setItem('other.key', 'keep-me');
    await store.mutate('event-1', () => ({
      snapshot: sampleSnapshot,
      pending: [
        {
          guestId: 'guest-1',
          invitationId: 'inv-1',
          arrivedAt: '2026-11-29T15:00:00-05:00',
          recordedBy: 'user-organizer',
        },
      ],
      result: null,
    }));
    await store.mutate('event-2', () => ({
      pending: [
        {
          guestId: 'guest-2',
          invitationId: 'inv-2',
          arrivedAt: '2026-11-29T15:00:00-05:00',
          recordedBy: 'user-organizer',
        },
      ],
      result: null,
    }));

    expect(await store.pendingTotal()).toBe(2);
    expect(await store.eventIdsWithPending()).toEqual(['event-1', 'event-2']);

    await store.clearAll();

    expect(await store.listSnapshots()).toEqual([]);
    expect(await store.pendingTotal()).toBe(0);
    expect(await store.eventIdsWithPending()).toEqual([]);
    expect(localStorage.getItem('other.key')).toBe('keep-me');
  });
});
