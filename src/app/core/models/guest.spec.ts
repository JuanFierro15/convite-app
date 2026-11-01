import { CONNECTION_ERROR_MESSAGE } from '../utils/messages';
import {
  GUEST_ERROR_MESSAGES,
  GuestApiError,
  guestErrorMessage,
  guestLoadErrorCode,
} from './guest';

describe('guest models and error handling', () => {
  describe('guestErrorMessage', () => {
    it('returns the same text for neutral error codes regardless of kind', () => {
      const neutralCodes = ['invalid_code', 'load_failed'] as const;

      for (const code of neutralCodes) {
        const withoutKind = guestErrorMessage(code);
        const individual = guestErrorMessage(code, 'individual');
        const group = guestErrorMessage(code, 'group');

        expect(withoutKind).toBe(individual);
        expect(withoutKind).toBe(group);
      }

      expect(guestErrorMessage('invalid_code')).toBe(
        'No encontramos esta invitación. Revisa que el enlace esté completo.',
      );
      expect(guestErrorMessage('load_failed')).toBe(
        'No pudimos cargar la invitación. Toca "Reintentar".',
      );
    });

    it('returns individual variant for undefined and individual, and group variant for group', () => {
      const variantCodes = [
        'deadline_passed',
        'already_reserved',
        'gift_full',
        'network_error',
      ] as const;

      for (const code of variantCodes) {
        const withoutKind = guestErrorMessage(code);
        const individual = guestErrorMessage(code, 'individual');
        const group = guestErrorMessage(code, 'group');

        expect(withoutKind).toBe(individual);
        expect(group).not.toBe(individual);
      }

      expect(guestErrorMessage('deadline_passed', 'individual')).toBe(
        'El plazo para responder ya terminó. Si necesitas cambiar tu respuesta, escríbenos al WhatsApp donde te llegó la invitación.',
      );
      expect(guestErrorMessage('deadline_passed', 'group')).toBe(
        'El plazo para responder ya terminó. Si necesitan cambiar su respuesta, escríbannos al WhatsApp donde les llegó la invitación.',
      );

      expect(guestErrorMessage('already_reserved', 'individual')).toBe(
        'Alguien acaba de elegir este regalo. Elige otro de la lista.',
      );
      expect(guestErrorMessage('already_reserved', 'group')).toBe(
        'Alguien acaba de elegir este regalo. Elijan otro de la lista.',
      );

      expect(guestErrorMessage('gift_full', 'individual')).toBe(
        'Este regalo ya completó sus cupos. Elige otro de la lista.',
      );
      expect(guestErrorMessage('gift_full', 'group')).toBe(
        'Este regalo ya completó sus cupos. Elijan otro de la lista.',
      );
    });

    it('returns CONNECTION_ERROR_MESSAGE for network_error with undefined and individual, and custom text for group', () => {
      expect(guestErrorMessage('network_error')).toBe(CONNECTION_ERROR_MESSAGE);
      expect(guestErrorMessage('network_error', 'individual')).toBe(CONNECTION_ERROR_MESSAGE);
      expect(guestErrorMessage('network_error', 'group')).toBe(
        'No pudimos conectarnos. Revisen su conexión e inténtenlo de nuevo.',
      );
    });

    it('returns unchanged texts for unchanged codes regardless of kind', () => {
      const unchangedCodes = [
        'gifts_closed',
        'not_reserved_by_you',
        'gift_not_reservable',
      ] as const;

      for (const code of unchangedCodes) {
        const withoutKind = guestErrorMessage(code);
        const individual = guestErrorMessage(code, 'individual');
        const group = guestErrorMessage(code, 'group');

        expect(withoutKind).toBe(individual);
        expect(withoutKind).toBe(group);
      }

      expect(guestErrorMessage('gifts_closed')).toBe('La lista de regalos ya está cerrada.');
      expect(guestErrorMessage('not_reserved_by_you')).toBe(
        'Este regalo ya no está elegido en esta invitación.',
      );
      expect(guestErrorMessage('gift_not_reservable')).toBe(
        'Esta opción es solo una idea: no hace falta reservarla.',
      );
    });

    it('returns default fallback text in both variants for unknown codes', () => {
      expect(guestErrorMessage('unrecognized_code')).toBe(
        'No pudimos guardar el cambio. Inténtalo de nuevo.',
      );
      expect(guestErrorMessage('unrecognized_code', 'individual')).toBe(
        'No pudimos guardar el cambio. Inténtalo de nuevo.',
      );
      expect(guestErrorMessage('unrecognized_code', 'group')).toBe(
        'No pudimos guardar el cambio. Inténtenlo de nuevo.',
      );
    });
  });

  describe('guestLoadErrorCode', () => {
    it('returns invalid_code for invalid_code', () => {
      expect(guestLoadErrorCode('invalid_code')).toBe('invalid_code');
    });

    it('returns network_error for network_error', () => {
      expect(guestLoadErrorCode('network_error')).toBe('network_error');
    });

    it('returns load_failed for load_failed', () => {
      expect(guestLoadErrorCode('load_failed')).toBe('load_failed');
    });

    it('returns load_failed for deadline_passed and unknown codes', () => {
      expect(guestLoadErrorCode('deadline_passed')).toBe('load_failed');
      expect(guestLoadErrorCode('some_random_code')).toBe('load_failed');
    });
  });

  describe('GuestApiError', () => {
    it('sets code and defaults message to guestErrorMessage(code)', () => {
      const err = new GuestApiError('invalid_code');
      expect(err.code).toBe('invalid_code');
      expect(err.message).toBe('No encontramos esta invitación. Revisa que el enlace esté completo.');
      expect(err.name).toBe('GuestApiError');
    });

    it('allows overriding message', () => {
      const err = new GuestApiError('invalid_code', 'Mensaje personalizado');
      expect(err.code).toBe('invalid_code');
      expect(err.message).toBe('Mensaje personalizado');
    });
  });
});
