import { Tables } from '../supabase/database.types';

export type InvitationBatchRow = Tables<'invitation_batches'>;

export interface InvitationBatchInput {
  name: string;
  rsvp_deadline: string; // ISO con zona, ya calculado por quien llama (endOfDayBogota)
}

export const FIRST_BATCH_LABEL = 'Primera tanda';
