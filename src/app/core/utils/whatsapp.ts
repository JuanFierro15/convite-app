import { formatDayMonth, formatLongDate, formatTime } from './dates';
import { InvitationKind } from './invitation-texts';
import { normalizePhone } from './phone';

export interface InvitationMessageParams {
  groupName: string;
  eventName: string;
  startsAt: string | Date;
  rsvpDeadline: string | Date;
  link: string;
  kind?: InvitationKind;
}

export function invitationMessage({
  groupName,
  eventName,
  startsAt,
  rsvpDeadline,
  link,
  kind = 'group',
}: InvitationMessageParams): string {
  const trimmedGroup = groupName.trim();
  const match = trimmedGroup.match(/^familia\s+(.+)$/i);
  const saludoName = match ? `familia ${match[1]}` : trimmedGroup;

  const longDate = formatLongDate(startsAt).replace(',', '');
  const capitalizedDate = longDate.charAt(0).toUpperCase() + longDate.slice(1);
  const dateTimeLine = `${capitalizedDate}, ${formatTime(startsAt)}`;

  const deadlineText = formatDayMonth(rsvpDeadline);
  const trimmedEvent = eventName.trim();

  if (kind === 'individual') {
    return (
      `Hola, ${saludoName}.\n\n` +
      `Te invitamos al *${trimmedEvent}*\n` +
      `${dateTimeLine}\n\n` +
      `Por favor confirma tu asistencia hasta el ${deadlineText} en este enlace:\n` +
      `${link.trim()}`
    );
  }

  return (
    `Hola, ${saludoName}.\n\n` +
    `Los invitamos al *${trimmedEvent}*\n` +
    `${dateTimeLine}\n\n` +
    `Por favor confirmen su asistencia hasta el ${deadlineText} en este enlace:\n` +
    `${link.trim()}`
  );
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
