import { Injectable, inject } from '@angular/core';
import { RsvpLogEntry, RsvpLogPage, RsvpLogSource } from '../models/rsvp-log';
import { SupabaseService } from '../supabase/supabase.service';
import { normalizeRsvp } from '../utils/invitation-status';
import { toUserError } from './errors';

interface RawRsvpLogItem {
  id?: unknown;
  invitation_id?: unknown;
  guest_id?: unknown;
  guest_name?: unknown;
  group_name?: unknown;
  invitation_kind?: unknown;
  previous_rsvp?: unknown;
  rsvp?: unknown;
  source?: unknown;
  actor_name?: unknown;
  created_at?: unknown;
}

interface RawRsvpLogResponse {
  total?: unknown;
  items?: unknown;
}

@Injectable({ providedIn: 'root' })
export class RsvpLogRepository {
  private readonly supabase = inject(SupabaseService);

  async list(eventId: string, options: { limit: number; offset: number }): Promise<RsvpLogPage> {
    const { data, error } = await this.supabase.client.rpc('list_rsvp_log', {
      p_event_id: eventId,
      p_limit: options.limit,
      p_offset: options.offset,
    });

    if (error) {
      throw toUserError(error);
    }

    const raw = (data ?? {}) as RawRsvpLogResponse;
    const rawItems: RawRsvpLogItem[] = Array.isArray(raw.items) ? raw.items : [];

    const items: RsvpLogEntry[] = rawItems.map((item) => {
      const rsvp = normalizeRsvp(item?.rsvp);
      const previous_rsvp =
        item?.previous_rsvp === null || item?.previous_rsvp === undefined
          ? null
          : normalizeRsvp(item.previous_rsvp);

      let source: RsvpLogSource;
      if (item?.source === 'guest' || item?.source === 'team') {
        source = item.source;
      } else {
        source = 'unknown';
      }

      const invitation_kind = item?.invitation_kind === 'group' ? 'group' : 'individual';

      const actorNameRaw =
        typeof item?.actor_name === 'string' ? item.actor_name.trim() : null;
      const actor_name = actorNameRaw && actorNameRaw.length > 0 ? actorNameRaw : null;

      return {
        id: typeof item?.id === 'string' ? item.id : '',
        invitation_id: typeof item?.invitation_id === 'string' ? item.invitation_id : '',
        guest_id: typeof item?.guest_id === 'string' ? item.guest_id : '',
        guest_name: typeof item?.guest_name === 'string' ? item.guest_name : '',
        group_name: typeof item?.group_name === 'string' ? item.group_name : '',
        invitation_kind,
        previous_rsvp,
        rsvp,
        source,
        actor_name,
        created_at: typeof item?.created_at === 'string' ? item.created_at : '',
      };
    });

    const rawTotal = raw.total;
    const total =
      typeof rawTotal === 'number' && Number.isFinite(rawTotal) ? rawTotal : items.length;

    return {
      total,
      items,
    };
  }
}
