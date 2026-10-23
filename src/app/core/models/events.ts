import { Tables } from '../supabase/database.types';

export type Rsvp = 'pending' | 'accepted' | 'declined';

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'partial';

export type EventRole = 'owner' | 'helper';

export type EventRow = Tables<'events'>;

export type EventMemberRow = Tables<'event_members'>;

export interface RsvpCounts {
  accepted: number;
  pending: number;
  declined: number;
  total: number;
}

export interface EventSummary {
  event: EventRow;
  role: EventRole;
  counts: RsvpCounts;
}

export interface EventInput {
  name: string;
  theme_id: string;
  starts_at: string;
  venue_name: string | null;
  venue_address: string | null;
  city: string | null;
  map_url: string | null;
  welcome_message: string | null;
  rsvp_deadline: string;
  budget_cop: number | null;
}
