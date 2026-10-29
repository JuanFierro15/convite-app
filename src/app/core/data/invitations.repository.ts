import { Injectable, inject } from '@angular/core';
import { Rsvp } from '../models/events';
import { GuestRow, InvitationInput, InvitationWithGuests } from '../models/invitations';
import { SupabaseService } from '../supabase/supabase.service';
import { guestInvitationUrl } from '../utils/guest-link';
import { toInvitationKind } from '../utils/invitation-texts';
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
      kind: toInvitationKind(row.kind),
      phone: row.phone,
      code: row.code,
      created_at: row.created_at,
      updated_at: row.updated_at,
      whatsapp_sent_at: row.whatsapp_sent_at,
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
      kind: toInvitationKind(data.kind),
      phone: data.phone,
      code: data.code,
      created_at: data.created_at,
      updated_at: data.updated_at,
      whatsapp_sent_at: data.whatsapp_sent_at,
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
      p_kind: input.kind,
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

  async findPhoneInEvent(
    eventId: string,
    e164: string,
    excludeInvitationId?: string,
  ): Promise<string[]> {
    const { data, error } = await this.supabase.client
      .from('invitations')
      .select('id, group_name')
      .eq('event_id', eventId)
      .eq('phone', e164);

    if (error) {
      throw toUserError(error);
    }

    const rows = (data ?? []).filter((row) => row.id !== excludeInvitationId);
    return rows
      .map((row) => row.group_name)
      .sort((a, b) => a.localeCompare(b, 'es'));
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

  async markWhatsAppSent(invitationId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('invitations')
      .update({ whatsapp_sent_at: new Date().toISOString() })
      .eq('id', invitationId)
      .is('whatsapp_sent_at', null);

    if (error) {
      throw toUserError(error);
    }
  }

  async clearWhatsAppSent(invitationId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('invitations')
      .update({ whatsapp_sent_at: null })
      .eq('id', invitationId);

    if (error) {
      throw toUserError(error);
    }
  }

  guestLink(code: string): string {
    return guestInvitationUrl(code);
  }
}
