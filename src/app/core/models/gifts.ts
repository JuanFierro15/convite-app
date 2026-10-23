import { Tables } from '../supabase/database.types';

export type GiftKind = 'unique' | 'repeatable' | 'free';

export type GiftRow = Tables<'gifts'>;

export type GiftReservationRow = Tables<'gift_reservations'>;

export interface GiftReservationSummary {
  id: string;
  invitation_id: string;
  group_name: string;
  created_at: string;
}

export interface GiftWithReservations extends GiftRow {
  reservations: GiftReservationSummary[];
}

export interface GiftInput {
  name: string;
  description: string | null;
  category: string | null;
  kind: GiftKind;
}
