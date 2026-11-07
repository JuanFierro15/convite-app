import { RsvpLogEntry } from '../models/rsvp-log';
import { formatListAge } from './dates';

export function rsvpLogActionText(entry: Pick<RsvpLogEntry, 'rsvp'>): string {
  switch (entry.rsvp) {
    case 'accepted':
      return 'confirmó asistencia';
    case 'declined':
      return 'no asistirá';
    default:
      return 'quedó sin respuesta';
  }
}

export function rsvpLogOriginText(
  entry: Pick<RsvpLogEntry, 'source' | 'actor_name'>,
): string | null {
  if (entry.source === 'guest') {
    return 'Desde la invitación';
  }
  if (entry.source === 'team') {
    const actor = entry.actor_name?.trim();
    return actor ? `Marcado por ${actor}` : 'Marcado desde la app';
  }
  return null;
}

export function rsvpLogDetailText(
  entry: Pick<
    RsvpLogEntry,
    'invitation_kind' | 'group_name' | 'guest_name' | 'source' | 'actor_name' | 'created_at'
  >,
  now: Date,
): string {
  const parts: string[] = [];

  const isGroup = entry.invitation_kind === 'group';
  const trimmedGroup = entry.group_name ? entry.group_name.trim() : '';
  const trimmedGuest = entry.guest_name ? entry.guest_name.trim() : '';

  if (
    isGroup &&
    trimmedGroup.length > 0 &&
    trimmedGroup.toLowerCase() !== trimmedGuest.toLowerCase()
  ) {
    parts.push(trimmedGroup);
  }

  const origin = rsvpLogOriginText(entry);
  if (origin && origin.trim().length > 0) {
    parts.push(origin.trim());
  }

  const age = formatListAge(entry.created_at, now);
  if (age && age.trim().length > 0) {
    parts.push(age.trim());
  }

  return parts.join(' · ');
}
