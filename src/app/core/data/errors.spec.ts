import {
  AuthService,
  EventContextService,
  EventsRepository,
  GiftsRepository,
  GuestApiError,
  GuestApiService,
  InvitationsRepository,
  RealtimeService,
  SupabaseService,
  ThemeService,
  authGuard,
  guestErrorMessage,
  roleGuard,
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

  describe('toUserError', () => {
    it('translates gift_has_reservations', () => {
      const err = toUserError({ message: 'gift_has_reservations' });
      expect(err.message).toBe('Este regalo ya tiene reservas, así que no se puede cambiar su tipo.');
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

    it('translates unknown errors to default message', () => {
      const err = toUserError({ message: 'unexpected_db_error' });
      expect(err.message).toBe('No pudimos guardar el cambio. Inténtalo de nuevo.');
    });
  });

  describe('guestErrorMessage and GuestApiError', () => {
    it('translates known guest RPC error codes and falls back for unknown codes', () => {
      expect(guestErrorMessage('invalid_code')).toBe(
        'No encontramos esta invitación. Revisa el enlace que te enviaron.',
      );
      expect(guestErrorMessage('deadline_passed')).toBe(
        'El plazo para responder ya terminó. Si necesitas cambiar tu respuesta, escríbenos.',
      );
      expect(guestErrorMessage('already_reserved')).toBe(
        'Otra familia acaba de apartar este regalo. Elige otro de la lista.',
      );
      expect(guestErrorMessage('gifts_closed')).toBe('La lista de regalos ya está cerrada.');
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
        'Otra familia acaba de apartar este regalo. Elige otro de la lista.',
      );
    });
  });
});
