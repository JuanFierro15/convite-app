import { Injectable, inject } from '@angular/core';
import {
  GuestApiError,
  GuestGift,
  GuestInvitation,
  guestErrorMessage,
} from '../models/guest';
import { SupabaseService } from '../supabase/supabase.service';

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
] as const;

function toGuestApiError(error: unknown): GuestApiError {
  if (error instanceof GuestApiError) {
    return error;
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
  const code = matchedCode ?? (rawMessage || 'unknown_error');
  return new GuestApiError(code, guestErrorMessage(code));
}

@Injectable({ providedIn: 'root' })
export class GuestApiService {
  private readonly supabase = inject(SupabaseService);

  async getInvitation(code: string): Promise<GuestInvitation | null> {
    const { data, error } = await this.supabase.client.rpc('get_invitation', {
      p_code: code,
    });

    if (error) {
      throw toGuestApiError(error);
    }
    return (data as unknown as GuestInvitation | null) ?? null;
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
    return data as unknown as GuestInvitation;
  }

  async getGifts(code: string): Promise<GuestGift[]> {
    const { data, error } = await this.supabase.client.rpc('get_gifts', {
      p_code: code,
    });

    if (error) {
      throw toGuestApiError(error);
    }
    return (data as unknown as GuestGift[] | null) ?? [];
  }

  async reserveGift(code: string, giftId: string): Promise<GuestGift[]> {
    const { data, error } = await this.supabase.client.rpc('reserve_gift', {
      p_code: code,
      p_gift_id: giftId,
    });

    if (error) {
      throw toGuestApiError(error);
    }
    return (data as unknown as GuestGift[] | null) ?? [];
  }

  async releaseGift(code: string, giftId: string): Promise<GuestGift[]> {
    const { data, error } = await this.supabase.client.rpc('release_gift', {
      p_code: code,
      p_gift_id: giftId,
    });

    if (error) {
      throw toGuestApiError(error);
    }
    return (data as unknown as GuestGift[] | null) ?? [];
  }
}
