import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Rsvp } from '../models/events';
import { GuestRow, InvitationInput, InvitationWithGuests } from '../models/invitations';
import { SupabaseService } from '../supabase/supabase.service';
import { normalizePhone } from '../utils/phone';
import { LOAD_ERROR_MESSAGE, toUserError } from './errors';

function sortGuests(guests: GuestRow[]): GuestRow[] {
  return [...guests].sort((a, b) => {
    if (a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order;
    }
    return a.created_at.localeCompare(b.created_at);
  });
}

@Injectable({ providedIn: 'root' })
export class InvitationsRepository {
  private readonly supabase = inject(SupabaseService);

  async list(eventId: string): Promise<InvitationWithGuests[]> {
    const { data, error } = await this.supabase.client
      .from('invitations')
      .select('*, guests(*)')
      .eq('event_id', eventId);

    if (error) {
      throw toUserError(error, LOAD_ERROR_MESSAGE);
    }

    const items: InvitationWithGuests[] = (data ?? []).map((row) => ({
      id: row.id,
      event_id: row.event_id,
      group_name: row.group_name,
      phone: row.phone,
      code: row.code,
      created_at: row.created_at,
      updated_at: row.updated_at,
      guests: sortGuests(row.guests ?? []),
    }));

    return items.sort((a, b) => a.group_name.localeCompare(b.group_name, 'es'));
  }

  async get(invitationId: string): Promise<InvitationWithGuests | null> {
    const { data, error } = await this.supabase.client
      .from('invitations')
      .select('*, guests(*)')
      .eq('id', invitationId)
      .maybeSingle();

    if (error) {
      throw toUserError(error, LOAD_ERROR_MESSAGE);
    }
    if (!data) {
      return null;
    }

    return {
      id: data.id,
      event_id: data.event_id,
      group_name: data.group_name,
      phone: data.phone,
      code: data.code,
      created_at: data.created_at,
      updated_at: data.updated_at,
      guests: sortGuests(data.guests ?? []),
    };
  }

  async save(
    eventId: string,
    invitationId: string,
    input: InvitationInput,
  ): Promise<InvitationWithGuests> {
    let phone: string | null;
    try {
      phone = normalizePhone(input.phone);
    } catch (err) {
      throw toUserError(err);
    }

    const guests = input.guests.map((guest) => ({
      id: guest.id,
      full_name: guest.full_name.trim(),
    }));

    const { data, error } = await this.supabase.client.rpc('save_invitation', {
      p_invitation_id: invitationId,
      p_event_id: eventId,
      p_group_name: input.group_name.trim(),
      p_phone: phone ?? '',
      p_guests: guests,
    });

    if (error) {
      throw toUserError(error);
    }

    const saved = data as unknown as InvitationWithGuests;
    return {
      ...saved,
      guests: sortGuests(saved.guests ?? []),
    };
  }

  async remove(invitationId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('invitations')
      .delete()
      .eq('id', invitationId);

    if (error) {
      throw toUserError(error);
    }
  }

  async setGuestRsvp(guestId: string, rsvp: Rsvp): Promise<void> {
    const { error } = await this.supabase.client
      .from('guests')
      .update({ rsvp })
      .eq('id', guestId);

    if (error) {
      throw toUserError(error);
    }
  }

  guestLink(code: string): string {
    const base = environment.guestBaseUrl.replace(/\/+$/, '');
    return `${base}/i/${code}`;
  }
}
