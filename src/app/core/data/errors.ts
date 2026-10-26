import { CONNECTION_ERROR_MESSAGE } from '../utils/messages';

const DEFAULT_USER_ERROR_MESSAGE = 'No pudimos guardar el cambio. Inténtalo de nuevo.';
export const LOAD_ERROR_MESSAGE = 'No pudimos cargar la información. Inténtalo de nuevo.';

const CONNECTION_SUBSTRINGS = [
  'TimeoutError',
  'request_timeout',
  'AbortError',
  'FetchError',
  'Failed to fetch',
  'fetch failed',
  'NetworkError',
  'Network request failed',
  'Load failed',
] as const;

export function isConnectionError(error: unknown): boolean {
  const errObj =
    typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {};
  const name = typeof errObj['name'] === 'string' ? errObj['name'] : '';
  const message =
    typeof errObj['message'] === 'string'
      ? errObj['message']
      : typeof error === 'string'
        ? error
        : '';
  const details = typeof errObj['details'] === 'string' ? errObj['details'] : '';
  const combined = `${name} ${message} ${details}`;

  if (CONNECTION_SUBSTRINGS.some((token) => combined.includes(token))) {
    return true;
  }

  const trimmedMessage = message.trimStart().toLowerCase();
  if (trimmedMessage.startsWith('<!doctype') || trimmedMessage.startsWith('<html')) {
    return true;
  }

  return false;
}

export function toUserError(error: unknown, fallback?: string): Error {
  if (isConnectionError(error)) {
    return new Error(CONNECTION_ERROR_MESSAGE);
  }

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

  if (combined.includes('guests_required')) {
    return new Error('Agrega al menos una persona.');
  }

  if (
    combined.includes('invitation_event_mismatch') ||
    combined.includes('guest_not_in_invitation') ||
    combined.includes('individual_requires_one_guest') ||
    combined.includes('invalid_kind')
  ) {
    return new Error(DEFAULT_USER_ERROR_MESSAGE);
  }

  return new Error(fallback ?? DEFAULT_USER_ERROR_MESSAGE);
}
