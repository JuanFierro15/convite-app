const DEFAULT_USER_ERROR_MESSAGE = 'No pudimos guardar el cambio. Inténtalo de nuevo.';

export function toUserError(error: unknown): Error {
  const errObj =
    typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {};
  const message =
    typeof errObj['message'] === 'string'
      ? errObj['message']
      : typeof error === 'string'
        ? error
        : '';
  const details = typeof errObj['details'] === 'string' ? errObj['details'] : '';
  const code = typeof errObj['code'] === 'string' ? errObj['code'] : '';
  const combined = `${message} ${details}`;

  if (combined.includes('gift_has_reservations')) {
    return new Error('Este regalo ya tiene reservas, así que no se puede cambiar su tipo.');
  }

  if (
    combined.includes('gifts_one_free_per_event') ||
    (code === '23505' && combined.includes('gifts_one_free_per_event'))
  ) {
    return new Error('Este evento ya tiene un regalo libre.');
  }

  if (combined.includes('invitations_phone_format') || message === 'invalid_phone') {
    return new Error('El teléfono debe tener 10 dígitos y empezar por 3.');
  }

  if (combined.includes('events_rsvp_deadline_before_start')) {
    return new Error('La fecha límite debe ser anterior o igual a la fecha del evento.');
  }

  return new Error(DEFAULT_USER_ERROR_MESSAGE);
}
