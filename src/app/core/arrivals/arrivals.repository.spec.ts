import { TestBed } from '@angular/core/testing';
import { SupabaseService } from '../supabase/supabase.service';
import { ArrivalsRepository } from './arrivals.repository';

describe('ArrivalsRepository', () => {
  let repository: ArrivalsRepository;
  let mockSupabase: {
    client: {
      from: ReturnType<typeof vi.fn>;
      rpc: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    mockSupabase = {
      client: {
        from: vi.fn(),
        rpc: vi.fn(),
      },
    };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: mockSupabase }],
    });

    repository = TestBed.inject(ArrivalsRepository);
  });

  describe('download', () => {
    it('downloads event and invitations, sorts guests and invitations, and maps properly', async () => {
      const mockEventQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'event-1',
            name: 'Baby Shower Ficticio',
            theme_id: 'default',
            starts_at: '2026-11-29T15:00:00-05:00',
          },
          error: null,
        }),
      };

      const mockInvitationsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'inv-2',
              code: 'WXYZ6789KL',
              group_name: 'Zoraida Pérez',
              kind: 'individual',
              guests: [
                {
                  id: 'g-3',
                  full_name: 'Zoraida Pérez',
                  rsvp: 'accepted',
                  sort_order: 1,
                  created_at: '2026-10-01T00:00:00Z',
                  arrived_at: null,
                  arrived_by: null,
                },
              ],
            },
            {
              id: 'inv-1',
              code: 'ABCD2345GH',
              group_name: 'Ángela Gómez',
              kind: 'group',
              guests: [
                {
                  id: 'g-2',
                  full_name: 'Beatriz Gómez',
                  rsvp: 'pending',
                  sort_order: 2,
                  created_at: '2026-10-02T00:00:00Z',
                  arrived_at: null,
                  arrived_by: null,
                },
                {
                  id: 'g-1',
                  full_name: 'Ángela Gómez',
                  rsvp: 'accepted',
                  sort_order: 1,
                  created_at: '2026-10-01T00:00:00Z',
                  arrived_at: '2026-11-29T15:10:00-05:00',
                  arrived_by: 'user-organizer',
                },
              ],
            },
          ],
          error: null,
        }),
      };

      mockSupabase.client.from.mockImplementation((table: string) => {
        if (table === 'events') return mockEventQuery;
        if (table === 'invitations') return mockInvitationsQuery;
        throw new Error(`Unexpected table: ${table}`);
      });

      const snapshot = await repository.download('event-1', 'user-organizer');

      expect(snapshot.version).toBe(1);
      expect(snapshot.eventId).toBe('event-1');
      expect(snapshot.userId).toBe('user-organizer');
      expect(snapshot.event.name).toBe('Baby Shower Ficticio');

      // Check sorting by group_name ('Ángela Gómez' before 'Zoraida Pérez' in Spanish)
      expect(snapshot.invitations[0].group_name).toBe('Ángela Gómez');
      expect(snapshot.invitations[1].group_name).toBe('Zoraida Pérez');

      // Check guests sorting by sort_order
      expect(snapshot.invitations[0].guests[0].id).toBe('g-1');
      expect(snapshot.invitations[0].guests[1].id).toBe('g-2');
    });

    it('translates error with toUserError on failure', async () => {
      mockSupabase.client.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: new Error('network_error') }),
      });

      await expect(repository.download('event-1', 'user-organizer')).rejects.toThrow();
    });
  });

  describe('record', () => {
    it('calls record_arrivals rpc and returns results', async () => {
      mockSupabase.client.rpc.mockResolvedValue({
        data: [{ guest_id: 'g-1', status: 'recorded', arrived_at: '2026-11-29', arrived_by: 'u-1' }],
        error: null,
      });

      const results = await repository.record('event-1', [{ guest_id: 'g-1', arrived_at: '2026-11-29' }]);
      expect(mockSupabase.client.rpc).toHaveBeenCalledWith('record_arrivals', {
        p_event_id: 'event-1',
        p_arrivals: [{ guest_id: 'g-1', arrived_at: '2026-11-29' }],
      });
      expect(results).toEqual([{ guest_id: 'g-1', status: 'recorded', arrived_at: '2026-11-29', arrived_by: 'u-1' }]);
    });
  });

  describe('undo', () => {
    it('updates guests arrived_at to null', async () => {
      const mockQuery = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      mockSupabase.client.from.mockReturnValue(mockQuery);

      await repository.undo('g-1');
      expect(mockSupabase.client.from).toHaveBeenCalledWith('guests');
      expect(mockQuery.update).toHaveBeenCalledWith({ arrived_at: null });
      expect(mockQuery.eq).toHaveBeenCalledWith('id', 'g-1');
    });
  });
});
