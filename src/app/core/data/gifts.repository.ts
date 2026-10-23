import { Injectable, inject } from '@angular/core';
import {
  GiftInput,
  GiftKind,
  GiftReservationSummary,
  GiftRow,
  GiftWithReservations,
} from '../models/gifts';
import { SupabaseService } from '../supabase/supabase.service';
import { toUserError } from './errors';

const KIND_ORDER: Record<string, number> = {
  repeatable: 0,
  free: 1,
  unique: 2,
};

const SUGGESTED_GIFTS: readonly { name: string; kind: GiftKind; sort_order: number }[] = [
  { name: 'Lluvia de sobres', kind: 'repeatable', sort_order: 0 },
  { name: 'Pañales', kind: 'repeatable', sort_order: 1 },
  { name: 'Pañitos húmedos', kind: 'repeatable', sort_order: 2 },
  { name: 'Regalo libre', kind: 'free', sort_order: 3 },
];

function compareGifts(a: GiftRow, b: GiftRow): number {
  const kindDiff = (KIND_ORDER[a.kind] ?? 99) - (KIND_ORDER[b.kind] ?? 99);
  if (kindDiff !== 0) {
    return kindDiff;
  }
  if (a.sort_order !== b.sort_order) {
    return a.sort_order - b.sort_order;
  }
  return a.name.localeCompare(b.name, 'es');
}

@Injectable({ providedIn: 'root' })
export class GiftsRepository {
  private readonly supabase = inject(SupabaseService);

  async list(eventId: string): Promise<GiftWithReservations[]> {
    const { data, error } = await this.supabase.client
      .from('gifts')
      .select('*, gift_reservations(id, invitation_id, created_at, invitations(group_name))')
      .eq('event_id', eventId);

    if (error) {
      throw toUserError(error);
    }

    const items: GiftWithReservations[] = (data ?? []).map((row) => {
      const rawReservations = row.gift_reservations ?? [];
      const reservations: GiftReservationSummary[] = rawReservations
        .map((res) => {
          const inv = res.invitations as
            | { group_name: string }
            | { group_name: string }[]
            | null
            | undefined;
          const groupName = Array.isArray(inv)
            ? (inv[0]?.group_name ?? '')
            : (inv?.group_name ?? '');
          return {
            id: res.id,
            invitation_id: res.invitation_id,
            group_name: groupName,
            created_at: res.created_at,
          };
        })
        .sort((a, b) => a.created_at.localeCompare(b.created_at));

      return {
        id: row.id,
        event_id: row.event_id,
        name: row.name,
        description: row.description,
        category: row.category,
        kind: row.kind,
        sort_order: row.sort_order,
        created_at: row.created_at,
        reservations,
      };
    });

    return items.sort(compareGifts);
  }

  async create(eventId: string, input: GiftInput): Promise<GiftRow> {
    const { data, error } = await this.supabase.client
      .from('gifts')
      .insert({
        event_id: eventId,
        name: input.name.trim(),
        description: input.description,
        category: input.category,
        kind: input.kind,
      })
      .select('*')
      .single();

    if (error) {
      throw toUserError(error);
    }
    return data;
  }

  async update(giftId: string, input: GiftInput): Promise<GiftRow> {
    const { data, error } = await this.supabase.client
      .from('gifts')
      .update({
        name: input.name.trim(),
        description: input.description,
        category: input.category,
        kind: input.kind,
      })
      .eq('id', giftId)
      .select('*')
      .single();

    if (error) {
      throw toUserError(error);
    }
    return data;
  }

  async remove(giftId: string): Promise<void> {
    const { error } = await this.supabase.client.from('gifts').delete().eq('id', giftId);

    if (error) {
      throw toUserError(error);
    }
  }

  async releaseReservation(reservationId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('gift_reservations')
      .delete()
      .eq('id', reservationId);

    if (error) {
      throw toUserError(error);
    }
  }

  async addSuggested(eventId: string): Promise<number> {
    const { data: existing, error: fetchError } = await this.supabase.client
      .from('gifts')
      .select('name, kind')
      .eq('event_id', eventId);

    if (fetchError) {
      throw toUserError(fetchError);
    }

    const existingNames = new Set((existing ?? []).map((g) => g.name.trim().toLowerCase()));
    const hasFreeGift = (existing ?? []).some((g) => g.kind === 'free');

    const toCreate = SUGGESTED_GIFTS.filter((item) => {
      if (existingNames.has(item.name.toLowerCase())) {
        return false;
      }
      if (item.kind === 'free' && hasFreeGift) {
        return false;
      }
      return true;
    });

    if (toCreate.length === 0) {
      return 0;
    }

    const rowsToInsert = toCreate.map((item) => ({
      event_id: eventId,
      name: item.name,
      description: null,
      category: null,
      kind: item.kind,
      sort_order: item.sort_order,
    }));

    const { error: insertError } = await this.supabase.client.from('gifts').insert(rowsToInsert);

    if (insertError) {
      throw toUserError(insertError);
    }

    return rowsToInsert.length;
  }
}
