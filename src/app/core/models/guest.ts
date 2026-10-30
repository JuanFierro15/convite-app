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

export const GUEST_ERROR_MESSAGES: Record<string, string> = {
  invalid_code: 'No encontramos esta invitación. Revisa el enlace que te enviaron.',
  deadline_passed:
    'El plazo para responder ya terminó. Si necesitas cambiar tu respuesta, escríbenos.',
  already_reserved: 'Alguien acaba de elegir este regalo. Elige otro de la lista.',
  gifts_closed: 'La lista de regalos ya está cerrada.',
  network_error: CONNECTION_ERROR_MESSAGE,
  not_reserved_by_you: 'Este regalo ya no está elegido en esta invitación.',
  load_failed: 'No pudimos cargar tu invitación. Inténtalo de nuevo.',
  gift_full: 'Este regalo ya completó sus cupos. Elige otro de la lista.',
  gift_not_reservable: 'Esta opción es solo una idea: no hace falta reservarla.',
};

const DEFAULT_GUEST_ERROR_MESSAGE = 'No pudimos guardar el cambio. Inténtalo de nuevo.';

export function guestErrorMessage(code: string): string {
  return GUEST_ERROR_MESSAGES[code] ?? DEFAULT_GUEST_ERROR_MESSAGE;
}

export class GuestApiError extends Error {
  readonly code: string;

  constructor(code: string, message?: string) {
    super(message ?? guestErrorMessage(code));
    this.name = 'GuestApiError';
    this.code = code;
  }
}
