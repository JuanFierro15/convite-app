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
    return new Error('Ya hay familias que eligieron este regalo, así que no se puede cambiar su tipo.');
  }

  if (combined.includes('gift_not_reservable')) {
    return new Error('Las sugerencias y la lluvia de sobres no se reservan.');
  }

  if (
    combined.includes('gifts_one_free_per_event') ||
    (code === '23505' && combined.includes('gifts_one_free_per_event'))
  ) {
    return new Error('Este evento ya tiene un regalo libre.');
  }

  if (
    combined.includes('gifts_one_envelope_per_event') ||
    (code === '23505' && combined.includes('gifts_one_envelope_per_event'))
  ) {
    return new Error('Este evento ya tiene una lluvia de sobres.');
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

  if (combined.includes('reservations_exceed_limit')) {
    return new Error('El límite no puede ser menor que las familias que ya eligieron este regalo.');
  }

  if (combined.includes('gifts_max_reservations_valid')) {
    return new Error(
      'Un regalo repetible necesita un límite de 2 familias o más; los demás tipos no llevan límite.',
    );
  }

  if (combined.includes('payment_exceeds_expense')) {
    return new Error('El pago supera lo que falta por pagar.');
  }

  if (combined.includes('payment_future_date')) {
    return new Error('La fecha del pago no puede ser futura.');
  }

  if (combined.includes('amount_below_paid')) {
    return new Error('El monto no puede ser menor que lo que ya se pagó.');
  }

  if (combined.includes('profile_archived')) {
    return new Error('Ese perfil está archivado. Elige otro.');
  }

  if (combined.includes('profile_wrong_team') || combined.includes('profile_not_found')) {
    return new Error('Ese perfil no está disponible para este evento.');
  }

  if (combined.includes('expenses_category_same_event')) {
    return new Error('Esta categoría tiene gastos. Muévelos a otra categoría antes de borrarla.');
  }

  if (combined.includes('expense_categories_name_key')) {
    return new Error('Ya hay una categoría con ese nombre.');
  }

  if (combined.includes('team_profiles_active_name_key')) {
    return new Error('Ya hay un perfil activo con ese nombre.');
  }

  if (
    combined.includes('tasks_assignee_profile_id_fkey') ||
    combined.includes('expense_payments_paid_by_profile_id_fkey')
  ) {
    return new Error('Este perfil ya se usó. Puedes archivarlo.');
  }

  if (combined.includes('expense_already_linked') || combined.includes('expenses_task_id_key')) {
    return new Error('Ese gasto ya está vinculado a otra tarea.');
  }

  if (combined.includes('task_not_found')) {
    return new Error('Esta tarea ya no existe.');
  }

  if (
    combined.includes('invitation_event_mismatch') ||
    combined.includes('guest_not_in_invitation') ||
    combined.includes('individual_requires_one_guest') ||
    combined.includes('invalid_kind') ||
    combined.includes('invalid_expense_action') ||
    combined.includes('expense_not_found') ||
    combined.includes('event_id_immutable')
  ) {
    return new Error(DEFAULT_USER_ERROR_MESSAGE);
  }

  return new Error(fallback ?? DEFAULT_USER_ERROR_MESSAGE);
}
