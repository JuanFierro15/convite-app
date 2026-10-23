import { InvitationStatus, Rsvp, RsvpCounts } from '../models/events';

export function rsvpCounts(guests: readonly { rsvp: Rsvp | string }[]): RsvpCounts {
  let accepted = 0;
  let pending = 0;
  let declined = 0;

  for (const guest of guests) {
    if (guest.rsvp === 'accepted') {
      accepted += 1;
    } else if (guest.rsvp === 'declined') {
      declined += 1;
    } else {
      pending += 1;
    }
  }

  return {
    accepted,
    pending,
    declined,
    total: guests.length,
  };
}

export function invitationStatus(guests: readonly { rsvp: Rsvp | string }[]): InvitationStatus {
  if (guests.length === 0) {
    return 'pending';
  }

  const counts = rsvpCounts(guests);
  if (counts.pending === counts.total) {
    return 'pending';
  }
  if (counts.accepted === counts.total) {
    return 'accepted';
  }
  if (counts.declined === counts.total) {
    return 'declined';
  }
  return 'partial';
}
