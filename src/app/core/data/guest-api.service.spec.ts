import { TestBed } from '@angular/core/testing';
import { GUEST_ERROR_MESSAGES } from '../models/guest';
import { SupabaseService } from '../supabase/supabase.service';
import { GuestApiService, toGuestApiError } from './guest-api.service';

describe('GuestApiService', () => {
  let service: GuestApiService;
  let mockSupabase: {
    client: {
      rpc: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    mockSupabase = {
      client: {
        rpc: vi.fn(),
      },
    };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: mockSupabase }],
    });

    service = TestBed.inject(GuestApiService);
  });

  describe('toGuestApiError', () => {
    it('translates gift_full error code and message from GUEST_ERROR_MESSAGES', () => {
      const err = toGuestApiError({ message: 'gift_full' });
      expect(err.code).toBe('gift_full');
      expect(err.message).toBe(GUEST_ERROR_MESSAGES['gift_full']);
      expect(err.message).toBe('Esta opción ya completó sus cupos. Elige otra de la lista.');
    });
  });

  describe('normalization', () => {
    it('normalizes gifts in getGifts setting remaining: null and full: false when fields are missing', async () => {
      mockSupabase.client.rpc.mockResolvedValue({
        data: [
          {
            id: 'gift-1',
            name: 'Pañales',
            description: null,
            category: null,
            kind: 'repeatable',
            reserved_by_me: false,
            taken: false,
          },
        ],
        error: null,
      });

      const gifts = await service.getGifts('CODE123');

      expect(gifts).toHaveLength(1);
      expect(gifts[0].remaining).toBeNull();
      expect(gifts[0].full).toBe(false);
    });

    it('keeps numeric remaining and boolean full when present in reserveGift and releaseGift', async () => {
      mockSupabase.client.rpc.mockResolvedValue({
        data: [
          {
            id: 'gift-2',
            name: 'Pañitos',
            kind: 'repeatable',
            remaining: 3,
            full: true,
          },
        ],
        error: null,
      });

      const reserved = await service.reserveGift('CODE123', 'gift-2');
      expect(reserved[0].remaining).toBe(3);
      expect(reserved[0].full).toBe(true);

      const released = await service.releaseGift('CODE123', 'gift-2');
      expect(released[0].remaining).toBe(3);
      expect(released[0].full).toBe(true);
    });
  });
});
