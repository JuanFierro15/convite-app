import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { LOAD_ERROR_MESSAGE } from '../data/errors';
import { EventRow } from '../models/events';
import { InvitationBatchRow } from '../models/invitation-batches';
import { SupabaseService } from '../supabase/supabase.service';
import { ThemeService } from '../theme/theme.service';
import { CONNECTION_ERROR_MESSAGE } from '../utils/messages';
import { EventContextService } from './event-context.service';

function makeEvent(id: string): EventRow {
  return {
    id,
    name: `Evento ${id}`,
    event_type: 'other',
    honoree_name: null,
    theme_id: 'baby-shower',
    starts_at: '2026-11-29T15:00:00-05:00',
    rsvp_deadline: '2026-11-15T23:59:59-05:00',
    venue_name: 'Salón Ejemplo',
    venue_address: 'Calle 1 # 2-3',
    city: 'Neiva',
    map_url: null,
    welcome_message: null,
    budget_cop: 1000000,
    team_id: 'team-1',
    created_by: 'user-1',
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
  };
}

function makeBatch(
  id: string,
  rsvpDeadline: string,
  createdAt = '2026-10-01T10:00:00Z',
  eventId = 'evt-1',
): InvitationBatchRow {
  return {
    id,
    event_id: eventId,
    name: `Tanda ${id}`,
    rsvp_deadline: rsvpDeadline,
    created_at: createdAt,
  };
}

interface QueryMockConfig {
  eventResult: { data: EventRow | null; error: unknown };
  memberResult: { data: { role: string } | null; error: unknown };
  batchesResult: { data: InvitationBatchRow[] | null; error: unknown };
}

describe('EventContextService', () => {
  let service: EventContextService;
  let mockAuthUser: ReturnType<typeof signal<{ id: string } | null>>;
  let mockTheme: { apply: ReturnType<typeof vi.fn> };
  let mockSupabase: {
    client: {
      auth: { getSession: ReturnType<typeof vi.fn> };
      from: ReturnType<typeof vi.fn>;
    };
  };

  function setupFromResponses(config: QueryMockConfig): void {
    mockSupabase.client.from.mockImplementation((table: string) => {
      if (table === 'events') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue(config.eventResult),
            }),
          }),
        };
      }

      if (table === 'event_members') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue(config.memberResult),
              }),
            }),
          }),
        };
      }

      if (table === 'invitation_batches') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(config.batchesResult),
          }),
        };
      }

      throw new Error(`Tabla inesperada: ${table}`);
    });
  }

  beforeEach(() => {
    mockAuthUser = signal<{ id: string } | null>({ id: 'user-1' });
    mockTheme = { apply: vi.fn() };
    mockSupabase = {
      client: {
        auth: {
          getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        },
        from: vi.fn(),
      },
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: AuthService, useValue: { user: mockAuthUser.asReadonly() } },
        { provide: ThemeService, useValue: mockTheme },
      ],
    });

    service = TestBed.inject(EventContextService);
  });

  it('carga correctamente con 0, 1 y 3 tandas desordenadas y las deja ordenadas', async () => {
    setupFromResponses({
      eventResult: { data: makeEvent('evt-0'), error: null },
      memberResult: { data: { role: 'owner' }, error: null },
      batchesResult: { data: [], error: null },
    });

    await service.load('evt-0');
    expect(service.event()?.id).toBe('evt-0');
    expect(service.batches()).toEqual([]);

    const oneBatch = makeBatch('b-1', '2026-11-18T23:59:59-05:00', '2026-10-01T10:00:00Z', 'evt-1');
    setupFromResponses({
      eventResult: { data: makeEvent('evt-1'), error: null },
      memberResult: { data: { role: 'helper' }, error: null },
      batchesResult: { data: [oneBatch], error: null },
    });

    await service.load('evt-1');
    expect(service.event()?.id).toBe('evt-1');
    expect(service.role()).toBe('helper');
    expect(service.batches()).toEqual([oneBatch]);

    const unordered = [
      makeBatch('b-last', '2026-11-24T23:59:59-05:00', '2026-10-01T10:00:00Z', 'evt-3'),
      makeBatch('b-tie-late', '2026-11-20T23:59:59-05:00', '2026-10-05T10:00:00Z', 'evt-3'),
      makeBatch('b-tie-early', '2026-11-20T23:59:59-05:00', '2026-10-02T10:00:00Z', 'evt-3'),
    ];
    setupFromResponses({
      eventResult: { data: makeEvent('evt-3'), error: null },
      memberResult: { data: { role: 'owner' }, error: null },
      batchesResult: { data: unordered, error: null },
    });

    await service.load('evt-3');
    expect(service.batches().map((b) => b.id)).toEqual(['b-tie-early', 'b-tie-late', 'b-last']);
  });

  it('cuando falla la consulta de tandas deja evento y tandas vacíos y asigna el error de carga', async () => {
    setupFromResponses({
      eventResult: { data: makeEvent('evt-1'), error: null },
      memberResult: { data: { role: 'owner' }, error: null },
      batchesResult: { data: null, error: { message: 'db_failure' } },
    });

    await service.load('evt-1');

    expect(service.event()).toBeNull();
    expect(service.role()).toBeNull();
    expect(service.batches()).toEqual([]);
    expect(service.error()).toBe(LOAD_ERROR_MESSAGE);
    expect(service.loading()).toBe(false);
  });

  it('cuando hay fallo de red al consultar tandas deja evento y tandas vacíos con mensaje de conexión', async () => {
    setupFromResponses({
      eventResult: { data: makeEvent('evt-1'), error: null },
      memberResult: { data: { role: 'owner' }, error: null },
      batchesResult: { data: null, error: { message: 'TypeError: Failed to fetch' } },
    });

    await service.load('evt-1');

    expect(service.event()).toBeNull();
    expect(service.batches()).toEqual([]);
    expect(service.error()).toBe(CONNECTION_ERROR_MESSAGE);
  });

  it('setBatches ordena las tandas y no comparte el arreglo recibido', () => {
    const input = [
      makeBatch('b-2', '2026-11-22T23:59:59-05:00'),
      makeBatch('b-1', '2026-11-18T23:59:59-05:00'),
    ];

    service.setBatches(input);
    expect(service.batches().map((b) => b.id)).toEqual(['b-1', 'b-2']);

    input.push(makeBatch('b-3', '2026-11-16T23:59:59-05:00'));
    expect(service.batches().map((b) => b.id)).toEqual(['b-1', 'b-2']);
  });

  it('clear vacía el evento, el rol y las tandas', async () => {
    setupFromResponses({
      eventResult: { data: makeEvent('evt-1'), error: null },
      memberResult: { data: { role: 'owner' }, error: null },
      batchesResult: {
        data: [makeBatch('b-1', '2026-11-18T23:59:59-05:00')],
        error: null,
      },
    });

    await service.load('evt-1');
    expect(service.batches()).toHaveLength(1);

    service.clear();

    expect(service.event()).toBeNull();
    expect(service.role()).toBeNull();
    expect(service.batches()).toEqual([]);
    expect(service.error()).toBeNull();
  });

  it('cambiar de evento no conserva las tandas del anterior (ni en éxito sin tandas ni ante fallo o sin sesión)', async () => {
    setupFromResponses({
      eventResult: { data: makeEvent('evt-1'), error: null },
      memberResult: { data: { role: 'owner' }, error: null },
      batchesResult: {
        data: [makeBatch('b-1', '2026-11-18T23:59:59-05:00', '2026-10-01T10:00:00Z', 'evt-1')],
        error: null,
      },
    });
    await service.load('evt-1');
    expect(service.batches().map((b) => b.id)).toEqual(['b-1']);

    // Segundo evento sin tandas no conserva las de evt-1
    setupFromResponses({
      eventResult: { data: makeEvent('evt-2'), error: null },
      memberResult: { data: { role: 'owner' }, error: null },
      batchesResult: { data: [], error: null },
    });
    await service.load('evt-2');
    expect(service.event()?.id).toBe('evt-2');
    expect(service.batches()).toEqual([]);

    // Recargamos con tandas y luego cambiamos a uno que no existe
    setupFromResponses({
      eventResult: { data: makeEvent('evt-2'), error: null },
      memberResult: { data: { role: 'owner' }, error: null },
      batchesResult: {
        data: [makeBatch('b-2', '2026-11-19T23:59:59-05:00', '2026-10-01T10:00:00Z', 'evt-2')],
        error: null,
      },
    });
    await service.load('evt-2', { force: true });
    expect(service.batches().map((b) => b.id)).toEqual(['b-2']);

    setupFromResponses({
      eventResult: { data: null, error: null },
      memberResult: { data: null, error: null },
      batchesResult: { data: [], error: null },
    });
    await service.load('evt-missing');
    expect(service.event()).toBeNull();
    expect(service.batches()).toEqual([]);
  });
});
