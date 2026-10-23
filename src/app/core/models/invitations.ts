import { Tables } from '../supabase/database.types';

export type InvitationRow = Tables<'invitations'>;

export type GuestRow = Tables<'guests'>;

export interface InvitationWithGuests extends InvitationRow {
  guests: GuestRow[];
}

export interface InvitationGuestInput {
  id?: string;
  full_name: string;
}

export interface InvitationInput {
  group_name: string;
  phone: string | null;
  guests: InvitationGuestInput[];
}
