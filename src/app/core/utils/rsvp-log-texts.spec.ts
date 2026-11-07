import {
  rsvpLogActionText,
  rsvpLogDetailText,
  rsvpLogOriginText,
} from './rsvp-log-texts';

describe('rsvp-log-texts', () => {
  describe('rsvpLogActionText', () => {
    it('returns "confirmó asistencia" for accepted', () => {
      expect(rsvpLogActionText({ rsvp: 'accepted' })).toBe('confirmó asistencia');
    });

    it('returns "no asistirá" for declined', () => {
      expect(rsvpLogActionText({ rsvp: 'declined' })).toBe('no asistirá');
    });

    it('returns "quedó sin respuesta" for pending', () => {
      expect(rsvpLogActionText({ rsvp: 'pending' })).toBe('quedó sin respuesta');
    });
  });

  describe('rsvpLogOriginText', () => {
    it('returns "Desde la invitación" for guest source', () => {
      expect(rsvpLogOriginText({ source: 'guest', actor_name: null })).toBe('Desde la invitación');
    });

    it('returns "Marcado por {actor_name}" when team has actor_name', () => {
      expect(rsvpLogOriginText({ source: 'team', actor_name: 'Camilo' })).toBe('Marcado por Camilo');
    });

    it('returns "Marcado desde la app" when team has no actor_name', () => {
      expect(rsvpLogOriginText({ source: 'team', actor_name: null })).toBe('Marcado desde la app');
      expect(rsvpLogOriginText({ source: 'team', actor_name: '' })).toBe('Marcado desde la app');
      expect(rsvpLogOriginText({ source: 'team', actor_name: '   ' })).toBe('Marcado desde la app');
    });

    it('returns null for unknown source', () => {
      expect(rsvpLogOriginText({ source: 'unknown', actor_name: null })).toBeNull();
    });
  });

  describe('rsvpLogDetailText', () => {
    const fixedNow = new Date('2026-11-07T15:00:00-05:00');

    it('includes group, origin and age for group invitation with different group name', () => {
      const tenMinutesAgo = new Date(fixedNow.getTime() - 10 * 60_000).toISOString();
      const text = rsvpLogDetailText(
        {
          invitation_kind: 'group',
          group_name: 'Familia Pérez',
          guest_name: 'María Pérez',
          source: 'guest',
          actor_name: null,
          created_at: tenMinutesAgo,
        },
        fixedNow,
      );

      expect(text).toBe('Familia Pérez · Desde la invitación · hace 10 min');
    });

    it('omits group if group_name matches guest_name ignoring case and whitespace', () => {
      const tenMinutesAgo = new Date(fixedNow.getTime() - 10 * 60_000).toISOString();
      const text = rsvpLogDetailText(
        {
          invitation_kind: 'group',
          group_name: '  maría pérez  ',
          guest_name: 'María Pérez',
          source: 'guest',
          actor_name: null,
          created_at: tenMinutesAgo,
        },
        fixedNow,
      );

      expect(text).toBe('Desde la invitación · hace 10 min');
    });

    it('omits group for individual invitation even if group_name is present', () => {
      const tenMinutesAgo = new Date(fixedNow.getTime() - 10 * 60_000).toISOString();
      const text = rsvpLogDetailText(
        {
          invitation_kind: 'individual',
          group_name: 'Familia Gómez',
          guest_name: 'Juan Gómez',
          source: 'team',
          actor_name: 'Ana',
          created_at: tenMinutesAgo,
        },
        fixedNow,
      );

      expect(text).toBe('Marcado por Ana · hace 10 min');
    });

    it('omits origin when source is unknown', () => {
      const tenMinutesAgo = new Date(fixedNow.getTime() - 10 * 60_000).toISOString();
      const text = rsvpLogDetailText(
        {
          invitation_kind: 'group',
          group_name: 'Familia Pérez',
          guest_name: 'María Pérez',
          source: 'unknown',
          actor_name: null,
          created_at: tenMinutesAgo,
        },
        fixedNow,
      );

      expect(text).toBe('Familia Pérez · hace 10 min');
    });
  });
});
