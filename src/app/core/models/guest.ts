import { CONNECTION_ERROR_MESSAGE } from '../utils/messages';
import { InvitationKind } from '../utils/invitation-texts';
import { Rsvp } from './events';
import { GiftKind } from './gifts';

export interface GuestInvitationEvent {
  name: string;
  theme_id: string;
  starts_at: string;
  venue_name: string | null;
  venue_address: string | null;
  city: string | null;
  map_url: string | null;
  welcome_message: string | null;
  rsvp_deadline: string;
}

export interface GuestInvitationPerson {
  id: string;
  full_name: string;
  rsvp: Rsvp;
}

export interface GuestInvitation {
  invitation: {
    id: string;
    group_name: string;
    code: string;
    kind: InvitationKind;
  };
  event: GuestInvitationEvent;
  guests: GuestInvitationPerson[];
  can_respond: boolean;
  gifts_open: boolean;
}

export interface GuestGift {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  kind: GiftKind;
  reserved_by_me: boolean;
  taken: boolean;
  remaining: number | null;
  full: boolean;
  max_reservations: number | null;
}

export type GuestErrorMessageEntry = string | { individual: string; group: string };

export const GUEST_ERROR_MESSAGES: Record<string, GuestErrorMessageEntry> = {
  invalid_code: 'No encontramos esta invitación. Revisa que el enlace esté completo.',
  load_failed: 'No pudimos cargar la invitación. Toca "Reintentar".',
  deadline_passed: {
    individual:
      'El plazo para responder ya terminó. Si necesitas cambiar tu respuesta, escríbenos al WhatsApp donde te llegó la invitación.',
    group:
      'El plazo para responder ya terminó. Si necesitan cambiar su respuesta, escríbannos al WhatsApp donde les llegó la invitación.',
  },
  already_reserved: {
    individual: 'Alguien acaba de elegir este regalo. Elige otro de la lista.',
    group: 'Alguien acaba de elegir este regalo. Elijan otro de la lista.',
  },
  gift_full: {
    individual: 'Este regalo ya completó sus cupos. Elige otro de la lista.',
    group: 'Este regalo ya completó sus cupos. Elijan otro de la lista.',
  },
  network_error: {
    individual: CONNECTION_ERROR_MESSAGE,
    group: 'No pudimos conectarnos. Revisen su conexión e inténtenlo de nuevo.',
  },
  gifts_closed: 'La lista de regalos ya está cerrada.',
  not_reserved_by_you: 'Este regalo ya no está elegido en esta invitación.',
  gift_not_reservable: 'Esta opción es solo una idea: no hace falta reservarla.',
};

const DEFAULT_GUEST_ERROR_MESSAGES: Record<InvitationKind, string> = {
  individual: 'No pudimos guardar el cambio. Inténtalo de nuevo.',
  group: 'No pudimos guardar el cambio. Inténtenlo de nuevo.',
};

export function guestErrorMessage(code: string, kind?: InvitationKind): string {
  const targetKind: InvitationKind = kind === 'group' ? 'group' : 'individual';
  const entry = GUEST_ERROR_MESSAGES[code];
  if (!entry) {
    return DEFAULT_GUEST_ERROR_MESSAGES[targetKind];
  }
  if (typeof entry === 'string') {
    return entry;
  }
  return entry[targetKind];
}

/** Códigos que pueden salir antes de cargar la invitación; cualquier otro se muestra como load_failed. */
export function guestLoadErrorCode(code: string): 'invalid_code' | 'network_error' | 'load_failed' {
  if (code === 'invalid_code' || code === 'network_error') {
    return code;
  }
  return 'load_failed';
}

export class GuestApiError extends Error {
  readonly code: string;

  constructor(code: string, message?: string) {
    super(message ?? guestErrorMessage(code));
    this.name = 'GuestApiError';
    this.code = code;
  }
}
