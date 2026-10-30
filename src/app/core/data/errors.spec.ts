import {
  AuthService,
  CONNECTION_ERROR_MESSAGE,
  EventContextService,
  EventsRepository,
  GUEST_ERROR_MESSAGES,
  GiftsRepository,
  GuestApiError,
  GuestApiService,
  InvitationsRepository,
  LOAD_ERROR_MESSAGE,
  RealtimeService,
  SupabaseService,
  ThemeService,
  authGuard,
  guestErrorMessage,
  isConnectionError,
  roleGuard,
  toGuestApiError,
  toUserError,
} from '../index';

describe('core exports and error translation', () => {
  it('re-exports services and guards from core index', () => {
    expect(SupabaseService).toBeDefined();
    expect(AuthService).toBeDefined();
    expect(authGuard).toBeDefined();
    expect(EventContextService).toBeDefined();
    expect(roleGuard).toBeDefined();
    expect(EventsRepository).toBeDefined();
    expect(InvitationsRepository).toBeDefined();
    expect(GiftsRepository).toBeDefined();
    expect(GuestApiService).toBeDefined();
    expect(RealtimeService).toBeDefined();
    expect(ThemeService).toBeDefined();
  });

  describe('toUserError and isConnectionError', () => {
    it('translates gift_has_reservations', () => {
      const err = toUserError({ message: 'gift_has_reservations' });
      expect(err.message).toBe(
        'Ya hay familias que eligieron este regalo, así que no se puede cambiar su tipo.',
      );
    });

    it('translates gift_not_reservable', () => {
      const err = toUserError({ message: 'gift_not_reservable' });
      expect(err.message).toBe('Las sugerencias no se reservan.');
    });

    it('translates unique violation 23505 on gifts_one_free_per_event', () => {
      const err = toUserError({
        code: '23505',
        message: 'duplicate key value violates unique constraint "gifts_one_free_per_event"',
      });
      expect(err.message).toBe('Este evento ya tiene un regalo libre.');
    });

    it('translates invitations_phone_format and invalid_phone', () => {
      const dbErr = toUserError({
        message: 'new row for relation "invitations" violates check constraint "invitations_phone_format"',
      });
      expect(dbErr.message).toBe('El teléfono debe tener 10 dígitos y empezar por 3.');

      const localErr = toUserError(new Error('invalid_phone'));
      expect(localErr.message).toBe('El teléfono debe tener 10 dígitos y empezar por 3.');
    });

    it('translates events_rsvp_deadline_before_start', () => {
      const err = toUserError({
        message: 'new row for relation "events" violates check constraint "events_rsvp_deadline_before_start"',
      });
      expect(err.message).toBe('La fecha límite debe ser anterior o igual a la fecha del evento.');
    });

    it('recognizes connection errors and translates them to CONNECTION_ERROR_MESSAGE', () => {
      const failedFetch = { message: 'TypeError: Failed to fetch' };
      const requestTimeout = { message: 'TimeoutError: request_timeout' };
      const cloudflareHtml = {
        message: '  <!DOCTYPE html><html><head><title>522</title></head><body></body></html>',
      };
      const timeoutErrorInstance = new Error('operation timed out');
      timeoutErrorInstance.name = 'TimeoutError';

      expect(isConnectionError(failedFetch)).toBe(true);
      expect(isConnectionError(requestTimeout)).toBe(true);
      expect(isConnectionError(cloudflareHtml)).toBe(true);
      expect(isConnectionError(timeoutErrorInstance)).toBe(true);

      expect(toUserError(failedFetch).message).toBe(CONNECTION_ERROR_MESSAGE);
      expect(toUserError(requestTimeout).message).toBe(CONNECTION_ERROR_MESSAGE);
      expect(toUserError(cloudflareHtml).message).toBe(CONNECTION_ERROR_MESSAGE);
      expect(toUserError(timeoutErrorInstance, LOAD_ERROR_MESSAGE).message).toBe(
        CONNECTION_ERROR_MESSAGE,
      );
    });

    it('translates guests_required', () => {
      const err = toUserError({ message: 'guests_required' });
      expect(err.message).toBe('Agrega al menos una persona.');
    });

    it('translates reservations_exceed_limit', () => {
      const err = toUserError({ message: 'reservations_exceed_limit' });
      expect(err.message).toBe(
        'El límite no puede ser menor que las familias que ya eligieron este regalo.',
      );
    });

    it('translates gifts_max_reservations_valid', () => {
      const err = toUserError({
        message:
          'new row for relation "gifts" violates check constraint "gifts_max_reservations_valid"',
      });
      expect(err.message).toBe(
        'Un regalo repetible necesita un límite de 2 familias o más; los demás tipos no llevan límite.',
      );
    });

    it('translates invitation_event_mismatch, guest_not_in_invitation, individual_requires_one_guest and invalid_kind to generic save message', () => {
      expect(toUserError({ message: 'invitation_event_mismatch' }).message).toBe(
        'No pudimos guardar el cambio. Inténtalo de nuevo.',
      );
      expect(toUserError({ message: 'guest_not_in_invitation' }).message).toBe(
        'No pudimos guardar el cambio. Inténtalo de nuevo.',
      );
      expect(toUserError({ message: 'individual_requires_one_guest' }).message).toBe(
        'No pudimos guardar el cambio. Inténtalo de nuevo.',
      );
      expect(toUserError({ message: 'invalid_kind' }).message).toBe(
        'No pudimos guardar el cambio. Inténtalo de nuevo.',
      );
    });

    it('uses fallback when provided for unknown errors', () => {
      const err = toUserError({ message: 'unexpected_db_error' }, LOAD_ERROR_MESSAGE);
      expect(err.message).toBe(LOAD_ERROR_MESSAGE);
    });

    it('translates unknown errors without fallback to default message', () => {
      const err = toUserError({ message: 'unexpected_db_error' });
      expect(err.message).toBe('No pudimos guardar el cambio. Inténtalo de nuevo.');
    });
  });

  describe('guestErrorMessage, GuestApiError and toGuestApiError', () => {
    it('translates known guest RPC error codes and falls back for unknown codes', () => {
      expect(guestErrorMessage('invalid_code')).toBe(
        'No encontramos esta invitación. Revisa el enlace que te enviaron.',
      );
      expect(guestErrorMessage('deadline_passed')).toBe(
        'El plazo para responder ya terminó. Si necesitas cambiar tu respuesta, escríbenos.',
      );
      expect(guestErrorMessage('already_reserved')).toBe(
        'Alguien acaba de elegir este regalo. Elige otro de la lista.',
      );
      expect(guestErrorMessage('gifts_closed')).toBe('La lista de regalos ya está cerrada.');
      expect(GUEST_ERROR_MESSAGES['network_error']).toBe(CONNECTION_ERROR_MESSAGE);
      expect(GUEST_ERROR_MESSAGES['not_reserved_by_you']).toBe(
        'Este regalo ya no está elegido en esta invitación.',
      );
      expect(GUEST_ERROR_MESSAGES['load_failed']).toBe(
        'No pudimos cargar tu invitación. Inténtalo de nuevo.',
      );
      expect(guestErrorMessage('network_error')).toBe(CONNECTION_ERROR_MESSAGE);
      expect(guestErrorMessage('not_reserved_by_you')).toBe(
        'Este regalo ya no está elegido en esta invitación.',
      );
      expect(guestErrorMessage('load_failed')).toBe(
        'No pudimos cargar tu invitación. Inténtalo de nuevo.',
      );
      expect(guestErrorMessage('gift_not_reservable')).toBe(
        'Esta opción es solo una idea: no hace falta reservarla.',
      );
      expect(guestErrorMessage('other_code')).toBe(
        'No pudimos guardar el cambio. Inténtalo de nuevo.',
      );
    });

    it('constructs GuestApiError with code and translated message', () => {
      const error = new GuestApiError('already_reserved');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(GuestApiError);
      expect(error.code).toBe('already_reserved');
      expect(error.message).toBe(
        'Alguien acaba de elegir este regalo. Elige otro de la lista.',
      );
    });

    it('converts connection errors to network_error in toGuestApiError', () => {
      const err1 = toGuestApiError({ message: 'TypeError: Failed to fetch' }, 'load_failed');
      expect(err1.code).toBe('network_error');
      expect(err1.message).toBe(CONNECTION_ERROR_MESSAGE);

      const err2 = toGuestApiError({ message: '<html><body>524</body></html>' });
      expect(err2.code).toBe('network_error');
      expect(err2.message).toBe(CONNECTION_ERROR_MESSAGE);
    });

    it('uses fallbackCode for unknown errors in toGuestApiError while keeping known codes', () => {
      const loadErr = toGuestApiError({ message: 'some_db_failure' }, 'load_failed');
      expect(loadErr.code).toBe('load_failed');
      expect(loadErr.message).toBe('No pudimos cargar tu invitación. Inténtalo de nuevo.');

      const invalidCodeErr = toGuestApiError({ message: 'invalid_code' }, 'load_failed');
      expect(invalidCodeErr.code).toBe('invalid_code');
      expect(invalidCodeErr.message).toBe(
        'No encontramos esta invitación. Revisa el enlace que te enviaron.',
      );

      const writeErr = toGuestApiError({ message: 'some_db_failure' });
      expect(writeErr.code).toBe('some_db_failure');
      expect(writeErr.message).toBe('No pudimos guardar el cambio. Inténtalo de nuevo.');
    });
  });
});
