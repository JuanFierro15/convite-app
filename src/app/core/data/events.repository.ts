import { Injectable, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { EventInput, EventRole, EventRow, EventSummary, RsvpCounts } from '../models/events';
import { SupabaseService } from '../supabase/supabase.service';
import { rsvpCounts } from '../utils/invitation-status';
import { LOAD_ERROR_MESSAGE, toUserError } from './errors';

@Injectable({ providedIn: 'root' })
export class EventsRepository {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  async listMine(): Promise<EventSummary[]> {
    const userId =
      this.auth.user()?.id ??
      (await this.supabase.client.auth.getSession()).data.session?.user.id ??
      null;

    if (!userId) {
      return [];
    }

    const [eventsResult, membersResult, guestsResult] = await Promise.all([
      this.supabase.client.from('events').select('*').order('starts_at', { ascending: true }),
      this.supabase.client.from('event_members').select('event_id, role').eq('user_id', userId),
      this.supabase.client.from('guests').select('event_id, rsvp'),
    ]);

    if (eventsResult.error) {
      throw toUserError(eventsResult.error, LOAD_ERROR_MESSAGE);
    }
    if (membersResult.error) {
      throw toUserError(membersResult.error, LOAD_ERROR_MESSAGE);
    }
    if (guestsResult.error) {
      throw toUserError(guestsResult.error, LOAD_ERROR_MESSAGE);
    }

    const roleByEventId = new Map<string, EventRole>();
    for (const member of membersResult.data ?? []) {
      roleByEventId.set(member.event_id, member.role as EventRole);
    }

    const guestsByEventId = new Map<string, { rsvp: string }[]>();
    for (const guest of guestsResult.data ?? []) {
      const list = guestsByEventId.get(guest.event_id);
      if (list) {
        list.push(guest);
      } else {
        guestsByEventId.set(guest.event_id, [guest]);
      }
    }

    const summaries: EventSummary[] = [];
    for (const event of eventsResult.data ?? []) {
      const role = roleByEventId.get(event.id) ?? (event.created_by === userId ? 'owner' : null);
      if (!role) {
        continue;
      }
      summaries.push({
        event,
        role,
        counts: rsvpCounts(guestsByEventId.get(event.id) ?? []),
      });
    }

    return summaries.sort(
      (a, b) => new Date(a.event.starts_at).getTime() - new Date(b.event.starts_at).getTime(),
    );
  }

  async get(id: string): Promise<EventRow | null> {
    const { data, error } = await this.supabase.client
      .from('events')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw toUserError(error, LOAD_ERROR_MESSAGE);
    }
    return data;
  }

  async create(input: EventInput): Promise<EventRow> {
    const payload = {
      name: input.name.trim(),
      theme_id: input.theme_id,
      starts_at: input.starts_at,
      venue_name: input.venue_name,
      venue_address: input.venue_address,
      city: input.city,
      map_url: input.map_url,
      welcome_message: input.welcome_message,
      rsvp_deadline: input.rsvp_deadline,
      budget_cop: input.budget_cop,
    };

    const { data, error } = await this.supabase.client
      .from('events')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      throw toUserError(error);
    }
    return data;
  }

  async update(id: string, input: Partial<EventInput>): Promise<EventRow> {
    const payload: Partial<EventInput> = { ...input };
    if (typeof payload.name === 'string') {
      payload.name = payload.name.trim();
    }

    const { data, error } = await this.supabase.client
      .from('events')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw toUserError(error);
    }
    return data;
  }

  async countsFor(eventId: string): Promise<RsvpCounts> {
    const { data, error } = await this.supabase.client
      .from('guests')
      .select('rsvp')
      .eq('event_id', eventId);

    if (error) {
      throw toUserError(error, LOAD_ERROR_MESSAGE);
    }
    return rsvpCounts(data ?? []);
  }
}
