import { normalizePhone } from './phone';

export interface InvitationMessageParams {
  groupName: string;
  eventName: string;
  dateText: string;
  link: string;
}

export function invitationMessage({
  groupName,
  eventName,
  dateText,
  link,
}: InvitationMessageParams): string {
  return `Hola, ${groupName}. Están invitados a ${eventName} el ${dateText}. Confirmen su asistencia aquí: ${link}`;
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
