import { Injectable, inject } from '@angular/core';
import { LOAD_ERROR_MESSAGE, toUserError } from '../data/errors';
import { Rsvp } from '../models/events';
import { Json } from '../supabase/database.types';
import { SupabaseService } from '../supabase/supabase.service';
import { toInvitationKind } from '../utils/invitation-texts';
import {
  ArrivalSnapshot,
  ArrivalSnapshotGuest,
  ArrivalSnapshotInvitation,
  RecordArrivalResult,
} from './arrival.models';

interface RawGuestRow {
  id: string;
  full_name: string;
  rsvp: string;
  sort_order: number;
  created_at: string;
  arrived_at: string | null;
  arrived_by: string | null;
}

@Injectable({ providedIn: 'root' })
export class ArrivalsRepository {
  private readonly supabase = inject(SupabaseService);

  async download(eventId: string, userId: string): Promise<ArrivalSnapshot> {
    const [eventResult, invitationsResult] = await Promise.all([
      this.supabase.client
        .from('events')
        .select('id, name, theme_id, starts_at')
        .eq('id', eventId)
        .single(),
      this.supabase.client
        .from('invitations')
        .select(
          'id, code, group_name, kind, guests(id, full_name, rsvp, sort_order, created_at, arrived_at, arrived_by)',
        )
        .eq('event_id', eventId),
    ]);

    if (eventResult.error) {
      throw toUserError(eventResult.error, LOAD_ERROR_MESSAGE);
    }
    if (invitationsResult.error) {
      throw toUserError(invitationsResult.error, LOAD_ERROR_MESSAGE);
    }

    const eventData = eventResult.data;
    const rawInvitations = invitationsResult.data ?? [];

    const sortedInvitations = [...rawInvitations].sort((a, b) =>
      a.group_name.localeCompare(b.group_name, 'es'),
    );

    const invitations: ArrivalSnapshotInvitation[] = sortedInvitations.map((inv) => {
      const rawGuests = (inv.guests as unknown as RawGuestRow[]) ?? [];

      const sortedGuests = [...rawGuests].sort((a, b) => {
        if (a.sort_order !== b.sort_order) {
          return a.sort_order - b.sort_order;
        }
        return a.created_at.localeCompare(b.created_at);
      });

      const guests: ArrivalSnapshotGuest[] = sortedGuests.map((guest) => ({
        id: guest.id,
        full_name: guest.full_name,
        rsvp: guest.rsvp as Rsvp,
        sort_order: guest.sort_order,
        arrived_at: guest.arrived_at,
        arrived_by: guest.arrived_by,
      }));

      return {
        id: inv.id,
        code: inv.code,
        group_name: inv.group_name,
        kind: toInvitationKind(inv.kind),
        guests,
      };
    });

    return {
      version: 1,
      eventId,
      userId,
      downloadedAt: new Date().toISOString(),
      event: {
        id: eventData.id,
        name: eventData.name,
        theme_id: eventData.theme_id,
        starts_at: eventData.starts_at,
      },
      invitations,
    };
  }

  async record(
    eventId: string,
    items: readonly { guest_id: string; arrived_at: string }[],
  ): Promise<RecordArrivalResult[]> {
    const { data, error } = await this.supabase.client.rpc('record_arrivals', {
      p_event_id: eventId,
      p_arrivals: items as unknown as Json,
    });

    if (error) {
      throw toUserError(error);
    }

    return (data as unknown as RecordArrivalResult[]) ?? [];
  }

  async undo(guestId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('guests')
      .update({ arrived_at: null })
      .eq('id', guestId);

    if (error) {
      throw toUserError(error);
    }
  }
}
