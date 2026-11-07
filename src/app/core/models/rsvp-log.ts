import { Rsvp } from './events';
import { InvitationKind } from '../utils/invitation-texts';

export type RsvpLogSource = 'guest' | 'team' | 'unknown';

export interface RsvpLogEntry {
  id: string;
  invitation_id: string;
  guest_id: string;
  guest_name: string;
  group_name: string;
  invitation_kind: InvitationKind;
  previous_rsvp: Rsvp | null;
  rsvp: Rsvp;
  source: RsvpLogSource;
  actor_name: string | null;
  created_at: string;
}

export interface RsvpLogPage {
  total: number;
  items: RsvpLogEntry[];
}
