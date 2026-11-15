import { Injectable, inject } from '@angular/core';
import { InvitationBatchInput, InvitationBatchRow } from '../models/invitation-batches';
import { SupabaseService } from '../supabase/supabase.service';
import { sortBatches } from '../utils/invitation-batches';
import { LOAD_ERROR_MESSAGE, toUserError } from './errors';

@Injectable({ providedIn: 'root' })
export class InvitationBatchesRepository {
  private readonly supabase = inject(SupabaseService);

  async list(eventId: string): Promise<InvitationBatchRow[]> {
    const { data, error } = await this.supabase.client
      .from('invitation_batches')
      .select('*')
      .eq('event_id', eventId);

    if (error) {
      throw toUserError(error, LOAD_ERROR_MESSAGE);
    }

    return sortBatches(data ?? []);
  }

  async create(
    eventId: string,
    id: string,
    input: InvitationBatchInput,
  ): Promise<InvitationBatchRow> {
    const { data, error } = await this.supabase.client
      .from('invitation_batches')
      .insert({
        id,
        event_id: eventId,
        name: input.name.trim(),
        rsvp_deadline: input.rsvp_deadline,
      })
      .select('*')
      .single();

    if (error) {
      const errorCode = (error as { code?: string }).code;
      const errorMessage = (error as { message?: string }).message ?? '';
      if (errorCode === '23505' && errorMessage.includes('invitation_batches_pkey')) {
        const { data: existing, error: selectError } = await this.supabase.client
          .from('invitation_batches')
          .select('*')
          .eq('id', id)
          .single();

        if (selectError) {
          throw toUserError(selectError);
        }

        return existing;
      }

      throw toUserError(error);
    }

    return data;
  }

  async update(id: string, input: InvitationBatchInput): Promise<InvitationBatchRow> {
    const { data, error } = await this.supabase.client
      .from('invitation_batches')
      .update({
        name: input.name.trim(),
        rsvp_deadline: input.rsvp_deadline,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw toUserError(error);
    }

    return data;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('invitation_batches')
      .delete()
      .eq('id', id);

    if (error) {
      throw toUserError(error);
    }
  }
}
