import { TestBed } from '@angular/core/testing';
import { SupabaseService } from '../supabase/supabase.service';
import { RsvpLogRepository } from './rsvp-log.repository';

describe('RsvpLogRepository', () => {
  let repository: RsvpLogRepository;
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

    repository = TestBed.inject(RsvpLogRepository);
  });

  it('calls rpc with exact parameters', async () => {
    mockSupabase.client.rpc.mockResolvedValue({
      data: {
        total: 1,
        items: [
          {
            id: 'log-1',
            invitation_id: 'inv-1',
            guest_id: 'guest-1',
            guest_name: 'María Pérez',
            group_name: 'Familia Pérez',
            invitation_kind: 'group',
            previous_rsvp: 'pending',
            rsvp: 'accepted',
            source: 'guest',
            actor_name: null,
            created_at: '2026-11-07T21:40:00.000Z',
          },
        ],
      },
      error: null,
    });

    const result = await repository.list('event-123', { limit: 10, offset: 20 });

    expect(mockSupabase.client.rpc).toHaveBeenCalledWith('list_rsvp_log', {
      p_event_id: 'event-123',
      p_limit: 10,
      p_offset: 20,
    });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      id: 'log-1',
      invitation_id: 'inv-1',
      guest_id: 'guest-1',
      guest_name: 'María Pérez',
      group_name: 'Familia Pérez',
      invitation_kind: 'group',
      previous_rsvp: 'pending',
      rsvp: 'accepted',
      source: 'guest',
      actor_name: null,
      created_at: '2026-11-07T21:40:00.000Z',
    });
  });

  it('normalizes previous_rsvp when null, undefined or with invalid value', async () => {
    mockSupabase.client.rpc.mockResolvedValue({
      data: {
        total: 2,
        items: [
          {
            id: 'log-1',
            previous_rsvp: null,
            rsvp: 'declined',
          },
          {
            id: 'log-2',
            previous_rsvp: 'invalid_status',
            rsvp: 'other',
          },
        ],
      },
      error: null,
    });

    const result = await repository.list('event-123', { limit: 10, offset: 0 });

    expect(result.items[0].previous_rsvp).toBeNull();
    expect(result.items[0].rsvp).toBe('declined');
    expect(result.items[1].previous_rsvp).toBe('pending');
    expect(result.items[1].rsvp).toBe('pending');
  });

  it('normalizes unknown source to "unknown"', async () => {
    mockSupabase.client.rpc.mockResolvedValue({
      data: {
        total: 3,
        items: [
          { id: '1', source: 'guest' },
          { id: '2', source: 'team' },
          { id: '3', source: 'unexpected' },
        ],
      },
      error: null,
    });

    const result = await repository.list('event-123', { limit: 10, offset: 0 });

    expect(result.items[0].source).toBe('guest');
    expect(result.items[1].source).toBe('team');
    expect(result.items[2].source).toBe('unknown');
  });

  it('normalizes invitation_kind different from "group" to "individual"', async () => {
    mockSupabase.client.rpc.mockResolvedValue({
      data: {
        total: 2,
        items: [
          { id: '1', invitation_kind: 'group' },
          { id: '2', invitation_kind: 'anything_else' },
        ],
      },
      error: null,
    });

    const result = await repository.list('event-123', { limit: 10, offset: 0 });

    expect(result.items[0].invitation_kind).toBe('group');
    expect(result.items[1].invitation_kind).toBe('individual');
  });

  it('normalizes actor_name empty or with whitespace only to null', async () => {
    mockSupabase.client.rpc.mockResolvedValue({
      data: {
        total: 3,
        items: [
          { id: '1', actor_name: '' },
          { id: '2', actor_name: '    ' },
          { id: '3', actor_name: '  Juan Pérez  ' },
        ],
      },
      error: null,
    });

    const result = await repository.list('event-123', { limit: 10, offset: 0 });

    expect(result.items[0].actor_name).toBeNull();
    expect(result.items[1].actor_name).toBeNull();
    expect(result.items[2].actor_name).toBe('Juan Pérez');
  });

  it('normalizes non-numeric total to items.length', async () => {
    mockSupabase.client.rpc.mockResolvedValue({
      data: {
        total: 'invalid',
        items: [{ id: '1' }, { id: '2' }],
      },
      error: null,
    });

    const result = await repository.list('event-123', { limit: 10, offset: 0 });

    expect(result.total).toBe(2);
  });

  it('normalizes absent items to empty array', async () => {
    mockSupabase.client.rpc.mockResolvedValue({
      data: {
        total: 0,
      },
      error: null,
    });

    const result = await repository.list('event-123', { limit: 10, offset: 0 });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('propagates error converted with toUserError', async () => {
    mockSupabase.client.rpc.mockResolvedValue({
      data: null,
      error: { message: 'not_event_member' },
    });

    await expect(repository.list('event-123', { limit: 10, offset: 0 })).rejects.toThrow();
  });
});
