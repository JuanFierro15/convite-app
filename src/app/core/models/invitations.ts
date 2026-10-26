import { Tables } from '../supabase/database.types';
import { InvitationKind } from '../utils/invitation-texts';

export type InvitationRow = Tables<'invitations'>;

export type GuestRow = Tables<'guests'>;

export interface InvitationWithGuests extends InvitationRow {
  guests: GuestRow[];
}

export interface InvitationGuestInput {
  id: string;
  full_name: string;
}

export interface InvitationInput {
  kind: InvitationKind;
  group_name: string;
  phone: string | null;
  guests: InvitationGuestInput[];
}
