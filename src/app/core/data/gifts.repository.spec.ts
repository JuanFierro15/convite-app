import { TestBed } from '@angular/core/testing';
import { SupabaseService } from '../supabase/supabase.service';
import { GiftsRepository } from './gifts.repository';
import { GiftInput } from '../models/gifts';

describe('GiftsRepository', () => {
  let repository: GiftsRepository;
  let mockSupabase: {
    client: {
      from: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    mockSupabase = {
      client: {
        from: vi.fn(),
      },
    };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: mockSupabase }],
    });

    repository = TestBed.inject(GiftsRepository);
  });

  describe('list', () => {
    it('returns max_reservations for mapped gifts', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'gift-1',
              event_id: 'event-1',
              name: 'Pañales etapa 1',
              description: 'Talla recién nacido',
              category: 'Higiene',
              kind: 'repeatable',
              max_reservations: 10,
              sort_order: 1,
              created_at: '2026-10-25T00:00:00Z',
              gift_reservations: [
                {
                  id: 'res-1',
                  created_at: '2026-10-25T01:00:00Z',
                },
              ],
            },
          ],
          error: null,
        }),
      };

      mockSupabase.client.from.mockReturnValue(mockQuery);

      const result = await repository.list('event-1');

      expect(mockSupabase.client.from).toHaveBeenCalledWith('gifts');
      expect(mockQuery.select).toHaveBeenCalledWith('*, gift_reservations(id, created_at)');
      expect(result).toHaveLength(1);
      expect(result[0].max_reservations).toBe(10);
      expect(result[0].reservations[0]).toEqual({
        id: 'res-1',
        created_at: '2026-10-25T01:00:00Z',
      });
    });
  });

  describe('create', () => {
    it('sends max_reservations when kind is repeatable', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'gift-rep', name: 'Pañales', kind: 'repeatable', max_reservations: 5 },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      mockSupabase.client.from.mockReturnValue({ insert: mockInsert });

      const input: GiftInput = {
        name: 'Pañales',
        description: null,
        category: null,
        kind: 'repeatable',
        max_reservations: 5,
      };

      await repository.create('event-1', input);

      expect(mockInsert).toHaveBeenCalledWith({
        event_id: 'event-1',
        name: 'Pañales',
        description: null,
        category: null,
        kind: 'repeatable',
        max_reservations: 5,
      });
    });

    it('sends null for max_reservations when kind is unique even if input has a number', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'gift-uniq', name: 'Coche', kind: 'unique', max_reservations: null },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      mockSupabase.client.from.mockReturnValue({ insert: mockInsert });

      const input: GiftInput = {
        name: 'Coche',
        description: null,
        category: null,
        kind: 'unique',
        max_reservations: 10,
      };

      await repository.create('event-1', input);

      expect(mockInsert).toHaveBeenCalledWith({
        event_id: 'event-1',
        name: 'Coche',
        description: null,
        category: null,
        kind: 'unique',
        max_reservations: null,
      });
    });
  });

  describe('update', () => {
    it('sends max_reservations when kind is repeatable', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'gift-rep', name: 'Pañales', kind: 'repeatable', max_reservations: 8 },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabase.client.from.mockReturnValue({ update: mockUpdate });

      const input: GiftInput = {
        name: 'Pañales',
        description: null,
        category: null,
        kind: 'repeatable',
        max_reservations: 8,
      };

      await repository.update('gift-rep', input);

      expect(mockUpdate).toHaveBeenCalledWith({
        name: 'Pañales',
        description: null,
        category: null,
        kind: 'repeatable',
        max_reservations: 8,
      });
      expect(mockEq).toHaveBeenCalledWith('id', 'gift-rep');
    });

    it('sends null for max_reservations when kind is unique even if input has a number', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'gift-uniq', name: 'Coche', kind: 'unique', max_reservations: null },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabase.client.from.mockReturnValue({ update: mockUpdate });

      const input: GiftInput = {
        name: 'Coche',
        description: null,
        category: null,
        kind: 'unique',
        max_reservations: 4,
      };

      await repository.update('gift-uniq', input);

      expect(mockUpdate).toHaveBeenCalledWith({
        name: 'Coche',
        description: null,
        category: null,
        kind: 'unique',
        max_reservations: null,
      });
      expect(mockEq).toHaveBeenCalledWith('id', 'gift-uniq');
    });
  });
});
