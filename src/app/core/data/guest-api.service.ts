import { Injectable, inject } from '@angular/core';
import {
  GuestApiError,
  GuestGift,
  GuestInvitation,
  guestErrorMessage,
} from '../models/guest';
import { SupabaseService } from '../supabase/supabase.service';
import { toInvitationKind } from '../utils/invitation-texts';
import { isConnectionError } from './errors';

export { GuestApiError, guestErrorMessage } from '../models/guest';

const KNOWN_RPC_CODES = [
  'invalid_code',
  'deadline_passed',
  'already_reserved',
  'gifts_closed',
  'guest_not_in_invitation',
  'invalid_value',
  'gift_not_found',
  'not_reserved_by_you',
  'gift_full',
  'gift_not_reservable',
] as const;

export function toGuestApiError(error: unknown, fallbackCode?: string): GuestApiError {
  if (error instanceof GuestApiError) {
    return error;
  }

  if (isConnectionError(error)) {
    return new GuestApiError('network_error', guestErrorMessage('network_error'));
  }

  const rawMessage =
    typeof error === 'object' &&
    error !== null &&
    typeof (error as Record<string, unknown>)['message'] === 'string'
      ? ((error as Record<string, unknown>)['message'] as string).trim()
      : typeof error === 'string'
        ? error.trim()
        : 'unknown_error';

  const matchedCode = KNOWN_RPC_CODES.find((c) => rawMessage === c || rawMessage.includes(c));
  const code = matchedCode ?? fallbackCode ?? (rawMessage || 'unknown_error');
  return new GuestApiError(code, guestErrorMessage(code));
}

function normalizeInvitationResponse(data: unknown): GuestInvitation | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const payload = data as GuestInvitation & {
    invitation?: {
      id?: string;
      group_name?: string;
      code?: unknown;
      kind?: unknown;
    };
  };
  const rawInv = payload.invitation;
  return {
    ...payload,
    invitation: {
      id: rawInv?.id ?? '',
      group_name: rawInv?.group_name ?? '',
      code: typeof rawInv?.code === 'string' ? rawInv.code : '',
      kind: toInvitationKind(rawInv?.kind),
    },
  };
}

@Injectable({ providedIn: 'root' })
export class GuestApiService {
  private readonly supabase = inject(SupabaseService);

  async getInvitation(code: string): Promise<GuestInvitation | null> {
    const { data, error } = await this.supabase.client.rpc('get_invitation', {
      p_code: code,
    });

    if (error) {
      throw toGuestApiError(error, 'load_failed');
    }
    return normalizeInvitationResponse(data);
  }

  async setRsvp(
    code: string,
    guestId: string,
    rsvp: 'accepted' | 'declined',
  ): Promise<GuestInvitation> {
    const { data, error } = await this.supabase.client.rpc('set_rsvp', {
      p_code: code,
      p_guest_id: guestId,
      p_rsvp: rsvp,
    });

    if (error) {
      throw toGuestApiError(error);
    }
    return normalizeInvitationResponse(data) as GuestInvitation;
  }

  private normalizeGiftsResponse(data: unknown): GuestGift[] {
    if (!Array.isArray(data)) {
      return [];
    }
    return data.map((item) => {
      const raw = (item ?? {}) as Record<string, unknown>;
      return {
        ...(raw as unknown as GuestGift),
        remaining: typeof raw['remaining'] === 'number' ? raw['remaining'] : null,
        full: raw['full'] === true,
        max_reservations:
          typeof raw['max_reservations'] === 'number' ? raw['max_reservations'] : null,
      };
    });
  }

  async getGifts(code: string): Promise<GuestGift[]> {
    const { data, error } = await this.supabase.client.rpc('get_gifts', {
      p_code: code,
    });

    if (error) {
      throw toGuestApiError(error, 'load_failed');
    }
    return this.normalizeGiftsResponse(data);
  }

  async reserveGift(code: string, giftId: string): Promise<GuestGift[]> {
    const { data, error } = await this.supabase.client.rpc('reserve_gift', {
      p_code: code,
      p_gift_id: giftId,
    });

    if (error) {
      throw toGuestApiError(error);
    }
    return this.normalizeGiftsResponse(data);
  }

  async releaseGift(code: string, giftId: string): Promise<GuestGift[]> {
    const { data, error } = await this.supabase.client.rpc('release_gift', {
      p_code: code,
      p_gift_id: giftId,
    });

    if (error) {
      throw toGuestApiError(error);
    }
    return this.normalizeGiftsResponse(data);
  }
}
