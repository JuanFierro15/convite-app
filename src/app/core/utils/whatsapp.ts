import { InvitationKind } from './invitation-texts';
import { normalizePhone } from './phone';

export interface InvitationMessageParams {
  groupName: string;
  eventName: string;
  dateText: string;
  link: string;
  kind?: InvitationKind;
}

export function invitationMessage({
  groupName,
  eventName,
  dateText,
  link,
  kind = 'group',
}: InvitationMessageParams): string {
  if (kind === 'individual') {
    return `Hola, ${groupName}. Te invitamos a ${eventName} el ${dateText}. Confirma tu asistencia aquí: ${link}`;
  }
  return `Hola, ${groupName}. Queremos que nos acompañen en ${eventName} el ${dateText}. Confirmen su asistencia aquí: ${link}`;
}

export function whatsappUrl(phone: string | null | undefined, message: string): string | null {
  if (!phone || phone.trim() === '') {
    return null;
  }

  let normalized: string | null;
  try {
    normalized = normalizePhone(phone);
  } catch {
    return null;
  }

  if (!normalized) {
    return null;
  }

  const digits = normalized.replace(/^\+/, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
