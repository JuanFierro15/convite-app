import {
  applyRecordResults,
  buildInvitationViews,
  classifyScanError,
  countsFromViews,
  enqueueArrivals,
  findInvitationByCode,
  removePending,
  searchInvitations,
} from './arrival-logic';
import {
  ArrivalSnapshot,
  PendingArrival,
  RecordArrivalResult,
} from './arrival.models';

const mockSnapshot: ArrivalSnapshot = {
  version: 1,
  eventId: 'event-1',
  userId: 'user-organizer',
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
          id: 'guest-1',
          full_name: 'Carlos Ramírez',
          rsvp: 'accepted',
          sort_order: 1,
          arrived_at: '2026-11-29T15:10:00-05:00',
          arrived_by: 'user-organizer',
        },
        {
          id: 'guest-2',
          full_name: 'Lucía Ramírez',
          rsvp: 'accepted',
          sort_order: 2,
          arrived_at: null,
          arrived_by: null,
        },
      ],
    },
    {
      id: 'inv-2',
      code: 'WXYZ6789KL',
      group_name: 'Mateo Gómez',
      kind: 'individual',
      guests: [
        {
          id: 'guest-3',
          full_name: 'Mateo Gómez',
          rsvp: 'pending',
          sort_order: 1,
          arrived_at: null,
          arrived_by: null,
        },
      ],
    },
  ],
};

describe('arrival-logic', () => {
  describe('buildInvitationViews', () => {
    it('returns empty array when snapshot is null', () => {
      expect(buildInvitationViews(null, [])).toEqual([]);
    });

    it('merges snapshot with pending arrivals preserving order and setting synced flag', () => {
      const pending: PendingArrival[] = [
        {
          guestId: 'guest-2',
          invitationId: 'inv-1',
          arrivedAt: '2026-11-29T15:20:00-05:00',
          recordedBy: 'user-organizer',
        },
      ];

      const views = buildInvitationViews(mockSnapshot, pending);
      expect(views).toHaveLength(2);

      // inv-1
      expect(views[0].id).toBe('inv-1');
      expect(views[0].arrivedCount).toBe(2);
      expect(views[0].totalCount).toBe(2);

      const guest1 = views[0].guests[0];
      expect(guest1.id).toBe('guest-1');
      expect(guest1.arrivedAt).toBe('2026-11-29T15:10:00-05:00');
      expect(guest1.synced).toBe(true);

      const guest2 = views[0].guests[1];
      expect(guest2.id).toBe('guest-2');
      expect(guest2.arrivedAt).toBe('2026-11-29T15:20:00-05:00');
      expect(guest2.synced).toBe(false);

      // inv-2
      expect(views[1].id).toBe('inv-2');
      expect(views[1].arrivedCount).toBe(0);
      expect(views[1].totalCount).toBe(1);
      expect(views[1].guests[0].arrivedAt).toBeNull();
      expect(views[1].guests[0].synced).toBe(true);
    });

    it('prefers snapshot arrival over pending queue arrival for same guest', () => {
      const pending: PendingArrival[] = [
        {
          guestId: 'guest-1',
          invitationId: 'inv-1',
          arrivedAt: '2026-11-29T15:99:99-05:00',
          recordedBy: 'user-organizer',
        },
      ];

      const views = buildInvitationViews(mockSnapshot, pending);
      expect(views[0].guests[0].arrivedAt).toBe('2026-11-29T15:10:00-05:00');
      expect(views[0].guests[0].synced).toBe(true);
    });
  });

  describe('countsFromViews', () => {
    it('computes confirmed and arrived statistics across all views', () => {
      const pending: PendingArrival[] = [
        {
          guestId: 'guest-3',
          invitationId: 'inv-2',
          arrivedAt: '2026-11-29T15:30:00-05:00',
          recordedBy: 'user-organizer',
        },
      ];

      const views = buildInvitationViews(mockSnapshot, pending);
      const counts = countsFromViews(views);

      expect(counts).toEqual({
        confirmed: 2, // guest-1 and guest-2 are accepted
        arrivedConfirmed: 1, // guest-1
        arrivedUnconfirmed: 1, // guest-3 is pending rsvp but arrived
        arrivedTotal: 2,
      });
    });
  });

  describe('findInvitationByCode', () => {
    it('finds invitation by code ignoring casing, hyphens, and whitespace', () => {
      const views = buildInvitationViews(mockSnapshot, []);
      const result = findInvitationByCode(views, 'abcd-2345-gh');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('inv-1');
    });

    it('returns null when code is not found or empty', () => {
      const views = buildInvitationViews(mockSnapshot, []);
      expect(findInvitationByCode(views, 'ZZZZ9999AA')).toBeNull();
      expect(findInvitationByCode(views, '   ')).toBeNull();
    });
  });

  describe('searchInvitations', () => {
    it('returns empty array when query is empty or limit <= 0', () => {
      const views = buildInvitationViews(mockSnapshot, []);
      expect(searchInvitations(views, '   ')).toEqual([]);
      expect(searchInvitations(views, 'Ramírez', 0)).toEqual([]);
    });

    it('matches by group name ignoring diacritics and casing', () => {
      const views = buildInvitationViews(mockSnapshot, []);
      const results = searchInvitations(views, 'ramirez');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('inv-1');
    });

    it('matches by guest full name ignoring diacritics and casing', () => {
      const views = buildInvitationViews(mockSnapshot, []);
      const results = searchInvitations(views, 'lucia');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('inv-1');
    });

    it('matches by code prefix when query code has 4 or more characters', () => {
      const views = buildInvitationViews(mockSnapshot, []);
      const results = searchInvitations(views, 'abcd');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('inv-1');
    });

    it('respects the limit argument', () => {
      const views = buildInvitationViews(mockSnapshot, []);
      const results = searchInvitations(views, 'a', 1);
      expect(results).toHaveLength(1);
    });
  });

  describe('enqueueArrivals', () => {
    it('adds un-arrived guests of the invitation that are not already in pending', () => {
      const pending: PendingArrival[] = [];
      const { pending: updated, added } = enqueueArrivals(
        mockSnapshot,
        pending,
        'inv-1',
        ['guest-1', 'guest-2'], // guest-1 already arrived in snapshot
        'user-organizer',
        '2026-11-29T15:25:00-05:00',
      );

      expect(added).toBe(1);
      expect(updated).toHaveLength(1);
      expect(updated[0]).toEqual({
        guestId: 'guest-2',
        invitationId: 'inv-1',
        arrivedAt: '2026-11-29T15:25:00-05:00',
        recordedBy: 'user-organizer',
      });
    });

    it('does not re-add guests already in pending', () => {
      const pending: PendingArrival[] = [
        {
          guestId: 'guest-2',
          invitationId: 'inv-1',
          arrivedAt: '2026-11-29T15:20:00-05:00',
          recordedBy: 'user-organizer',
        },
      ];

      const { pending: updated, added } = enqueueArrivals(
        mockSnapshot,
        pending,
        'inv-1',
        ['guest-2'],
        'user-organizer',
        '2026-11-29T15:25:00-05:00',
      );

      expect(added).toBe(0);
      expect(updated).toEqual(pending);
    });

    it('ignores guest ids not in the invitation and does not mutate inputs', () => {
      const pending: PendingArrival[] = [];
      const { pending: updated, added } = enqueueArrivals(
        mockSnapshot,
        pending,
        'inv-1',
        ['guest-3', 'unknown-id'],
        'user-organizer',
        '2026-11-29T15:25:00-05:00',
      );

      expect(added).toBe(0);
      expect(updated).toHaveLength(0);
      expect(pending).toHaveLength(0);
    });

    it('returns empty additions when snapshot or invitation is null/missing', () => {
      const { added } = enqueueArrivals(
        null,
        [],
        'inv-1',
        ['guest-2'],
        'user-organizer',
        '2026-11-29T15:25:00-05:00',
      );
      expect(added).toBe(0);
    });
  });

  describe('removePending', () => {
    it('removes pending arrival by guestId without mutating original array', () => {
      const original: PendingArrival[] = [
        {
          guestId: 'guest-1',
          invitationId: 'inv-1',
          arrivedAt: '2026-11-29T15:00:00-05:00',
          recordedBy: 'user-organizer',
        },
        {
          guestId: 'guest-2',
          invitationId: 'inv-1',
          arrivedAt: '2026-11-29T15:01:00-05:00',
          recordedBy: 'user-organizer',
        },
      ];

      const result = removePending(original, 'guest-1');
      expect(result).toHaveLength(1);
      expect(result[0].guestId).toBe('guest-2');
      expect(original).toHaveLength(2);
    });
  });

  describe('applyRecordResults', () => {
    it('applies recorded and already_arrived results, generates notices, and retains unaffected pending', () => {
      const pending: PendingArrival[] = [
        {
          guestId: 'guest-2',
          invitationId: 'inv-1',
          arrivedAt: '2026-11-29T15:20:00-05:00',
          recordedBy: 'user-organizer',
        },
        {
          guestId: 'guest-3',
          invitationId: 'inv-2',
          arrivedAt: '2026-11-29T15:21:00-05:00',
          recordedBy: 'user-organizer',
        },
      ];

      const results: RecordArrivalResult[] = [
        {
          guest_id: 'guest-2',
          status: 'recorded',
          arrived_at: '2026-11-29T15:22:00-05:00',
          arrived_by: 'user-organizer',
        },
        {
          guest_id: 'guest-1',
          status: 'already_arrived',
          arrived_at: '2026-11-29T14:45:00-05:00',
          arrived_by: 'other-user',
        },
        {
          guest_id: 'guest-unknown',
          status: 'not_found',
          arrived_at: null,
          arrived_by: null,
        },
      ];

      const { snapshot, pending: nextPending, notices } = applyRecordResults(
        mockSnapshot,
        pending,
        results,
        'user-organizer',
        'event-1',
      );

      // Pending: guest-2 was in results, so it was removed; guest-3 remains
      expect(nextPending).toHaveLength(1);
      expect(nextPending[0].guestId).toBe('guest-3');

      // Snapshot updated for guest-2
      const updatedGuest2 = snapshot?.invitations[0].guests.find((g) => g.id === 'guest-2');
      expect(updatedGuest2?.arrived_at).toBe('2026-11-29T15:22:00-05:00');
      expect(updatedGuest2?.arrived_by).toBe('user-organizer');

      // Notices:
      // 1. guest-1 already_arrived by other-user -> other_device notice
      // 2. guest-unknown not_found -> not_found notice
      expect(notices).toHaveLength(2);
      expect(notices[0].type).toBe('other_device');
      expect(notices[0].guestId).toBe('guest-1');
      expect(notices[0].fullName).toBe('Carlos Ramírez');
      expect(notices[0].message).toContain('Carlos Ramírez: ya tenía llegada registrada desde otro celular');

      expect(notices[1].type).toBe('not_found');
      expect(notices[1].guestId).toBe('guest-unknown');
      expect(notices[1].fullName).toBe('Una persona');
      expect(notices[1].message).toBe('Una persona ya no está en la lista.');
    });

    it('does not create other_device notice if already_arrived arrived_by equals currentUserId', () => {
      const results: RecordArrivalResult[] = [
        {
          guest_id: 'guest-1',
          status: 'already_arrived',
          arrived_at: '2026-11-29T15:10:00-05:00',
          arrived_by: 'user-organizer',
        },
      ];

      const { notices } = applyRecordResults(
        mockSnapshot,
        [],
        results,
        'user-organizer',
        'event-1',
      );

      expect(notices).toHaveLength(0);
    });
  });

  describe('classifyScanError', () => {
    it('classifies cancellations correctly', () => {
      expect(classifyScanError(new Error('User cancelled the scan'))).toBe('cancelled');
      expect(classifyScanError({ code: 'OS-PLUG-BARC-0006' })).toBe('cancelled');
      expect(classifyScanError({ message: 'scan Cancelled by user' })).toBe('cancelled');
      expect(classifyScanError('cancelled')).toBe('cancelled');
    });

    it('classifies other errors as unavailable', () => {
      expect(classifyScanError(new Error('Camera permission denied'))).toBe('unavailable');
      expect(classifyScanError(null)).toBe('unavailable');
      expect(classifyScanError(undefined)).toBe('unavailable');
      expect(classifyScanError({ code: 'CAMERA_NOT_FOUND' })).toBe('unavailable');
    });
  });
});
