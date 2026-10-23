import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Rsvp } from '../models/events';
import { GuestRow, InvitationInput, InvitationWithGuests } from '../models/invitations';
import { SupabaseService } from '../supabase/supabase.service';
import { normalizePhone } from '../utils/phone';
import { toUserError } from './errors';

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
      throw toUserError(error);
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
      throw toUserError(error);
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

  async create(eventId: string, input: InvitationInput): Promise<InvitationWithGuests> {
    let phone: string | null;
    try {
      phone = normalizePhone(input.phone);
    } catch (err) {
      throw toUserError(err);
    }

    const { data: invitation, error: invError } = await this.supabase.client
      .from('invitations')
      .insert({
        event_id: eventId,
        group_name: input.group_name.trim(),
        phone,
      })
      .select('*')
      .single();

    if (invError) {
      throw toUserError(invError);
    }

    let guests: GuestRow[] = [];
    if (input.guests.length > 0) {
      const rows = input.guests.map((guest, index) => ({
        invitation_id: invitation.id,
        event_id: eventId,
        full_name: guest.full_name.trim(),
        sort_order: index,
      }));

      const { data: insertedGuests, error: guestsError } = await this.supabase.client
        .from('guests')
        .insert(rows)
        .select('*');

      if (guestsError) {
        throw toUserError(guestsError);
      }
      guests = sortGuests(insertedGuests ?? []);
    }

    return {
      ...invitation,
      guests,
    };
  }

  async update(invitationId: string, input: InvitationInput): Promise<InvitationWithGuests> {
    let phone: string | null;
    try {
      phone = normalizePhone(input.phone);
    } catch (err) {
      throw toUserError(err);
    }

    const { data: invitation, error: invError } = await this.supabase.client
      .from('invitations')
      .update({
        group_name: input.group_name.trim(),
        phone,
      })
      .eq('id', invitationId)
      .select('*')
      .single();

    if (invError) {
      throw toUserError(invError);
    }

    const { data: existingGuests, error: existingError } = await this.supabase.client
      .from('guests')
      .select('id')
      .eq('invitation_id', invitationId);

    if (existingError) {
      throw toUserError(existingError);
    }

    const existingIds = new Set((existingGuests ?? []).map((g) => g.id));
    const incomingIds = new Set(
      input.guests.map((g) => g.id).filter((id): id is string => Boolean(id)),
    );

    const idsToDelete = [...existingIds].filter((id) => !incomingIds.has(id));
    if (idsToDelete.length > 0) {
      const { error: deleteError } = await this.supabase.client
        .from('guests')
        .delete()
        .in('id', idsToDelete);

      if (deleteError) {
        throw toUserError(deleteError);
      }
    }

    const indexedGuests = input.guests.map((guest, index) => ({
      id: guest.id,
      full_name: guest.full_name.trim(),
      sort_order: index,
    }));

    const existingToUpdate = indexedGuests.filter(
      (guest): guest is { id: string; full_name: string; sort_order: number } =>
        Boolean(guest.id && existingIds.has(guest.id)),
    );

    for (const guest of existingToUpdate) {
      const { error: updateError } = await this.supabase.client
        .from('guests')
        .update({
          full_name: guest.full_name,
          sort_order: guest.sort_order,
        })
        .eq('id', guest.id);

      if (updateError) {
        throw toUserError(updateError);
      }
    }

    const newToInsert = indexedGuests
      .filter((guest) => !guest.id || !existingIds.has(guest.id))
      .map((guest) => ({
        invitation_id: invitationId,
        event_id: invitation.event_id,
        full_name: guest.full_name,
        sort_order: guest.sort_order,
      }));

    if (newToInsert.length > 0) {
      const { error: insertError } = await this.supabase.client
        .from('guests')
        .insert(newToInsert);

      if (insertError) {
        throw toUserError(insertError);
      }
    }

    const updated = await this.get(invitationId);
    if (!updated) {
      throw toUserError(new Error('not_found'));
    }
    return updated;
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
