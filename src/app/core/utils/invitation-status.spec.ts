import { invitationStatus, normalizeRsvp, rsvpCounts } from './invitation-status';

describe('invitation-status', () => {
  describe('normalizeRsvp', () => {
    it('returns accepted and declined as is, and pending for any other value', () => {
      expect(normalizeRsvp('accepted')).toBe('accepted');
      expect(normalizeRsvp('declined')).toBe('declined');

      expect(normalizeRsvp('pending')).toBe('pending');
      expect(normalizeRsvp(null)).toBe('pending');
      expect(normalizeRsvp(undefined)).toBe('pending');
      expect(normalizeRsvp('')).toBe('pending');
      expect(normalizeRsvp('ACCEPTED')).toBe('pending');
      expect(normalizeRsvp('yes')).toBe('pending');
      expect(normalizeRsvp(1)).toBe('pending');
      expect(normalizeRsvp({})).toBe('pending');
    });
  });
  describe('invitationStatus', () => {
    it('returns pending when the invitation has no guests', () => {
      expect(invitationStatus([])).toBe('pending');
    });

    it('returns pending when all guests are pending', () => {
      expect(invitationStatus([{ rsvp: 'pending' }, { rsvp: 'pending' }])).toBe('pending');
    });

    it('returns accepted when all guests accepted', () => {
      expect(invitationStatus([{ rsvp: 'accepted' }, { rsvp: 'accepted' }])).toBe('accepted');
    });

    it('returns declined when all guests declined', () => {
      expect(invitationStatus([{ rsvp: 'declined' }, { rsvp: 'declined' }])).toBe('declined');
    });

    it('returns partial when responses are mixed', () => {
      expect(invitationStatus([{ rsvp: 'accepted' }, { rsvp: 'pending' }])).toBe('partial');
      expect(invitationStatus([{ rsvp: 'accepted' }, { rsvp: 'declined' }])).toBe('partial');
      expect(invitationStatus([{ rsvp: 'pending' }, { rsvp: 'declined' }])).toBe('partial');
      expect(
        invitationStatus([{ rsvp: 'accepted' }, { rsvp: 'pending' }, { rsvp: 'declined' }]),
      ).toBe('partial');
    });
  });

  describe('rsvpCounts', () => {
    it('counts accepted, pending, declined and total guests', () => {
      expect(rsvpCounts([])).toEqual({
        accepted: 0,
        pending: 0,
        declined: 0,
        total: 0,
      });

      expect(
        rsvpCounts([
          { rsvp: 'accepted' },
          { rsvp: 'accepted' },
          { rsvp: 'pending' },
          { rsvp: 'declined' },
        ]),
      ).toEqual({
        accepted: 2,
        pending: 1,
        declined: 1,
        total: 4,
      });
    });
  });
});
