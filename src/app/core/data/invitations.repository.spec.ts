import { TestBed } from '@angular/core/testing';
import { InvitationInput } from '../models/invitations';
import { SupabaseService } from '../supabase/supabase.service';
import { InvitationsRepository } from './invitations.repository';

describe('InvitationsRepository', () => {
  let repository: InvitationsRepository;
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

    repository = TestBed.inject(InvitationsRepository);
  });

  describe('save', () => {
    const input: InvitationInput = {
      kind: 'group',
      group_name: 'Familia Ejemplo',
      phone: '+57 300 123 4567',
      guests: [
        { id: 'guest-1', full_name: 'Invitado Uno' },
        { id: 'guest-2', full_name: 'Invitado Dos' },
      ],
    };

    it('envía p_known_guest_ids cuando se proporciona', async () => {
      mockSupabase.client.rpc.mockResolvedValue({
        data: {
          id: 'inv-1',
          event_id: 'event-1',
          batch_id: null,
          group_name: 'Familia Ejemplo',
          kind: 'group',
          phone: '+573001234567',
          code: 'CODE1',
          created_at: '2026-10-25T00:00:00Z',
          updated_at: '2026-10-25T00:00:00Z',
          whatsapp_sent_at: null,
          guests: [
            {
              id: 'guest-1',
              invitation_id: 'inv-1',
              full_name: 'Invitado Uno',
              sort_order: 0,
              created_at: '2026-10-25T00:00:00Z',
            },
          ],
        },
        error: null,
      });

      const result = await repository.save(
        'event-1',
        'inv-1',
        input,
        ['guest-1', 'guest-old'],
      );

      expect(mockSupabase.client.rpc).toHaveBeenCalledWith('save_invitation', {
        p_invitation_id: 'inv-1',
        p_event_id: 'event-1',
        p_group_name: 'Familia Ejemplo',
        p_phone: '+573001234567',
        p_guests: [
          { id: 'guest-1', full_name: 'Invitado Uno' },
          { id: 'guest-2', full_name: 'Invitado Dos' },
        ],
        p_kind: 'group',
        p_known_guest_ids: ['guest-1', 'guest-old'],
        p_batch_id: null,
        p_set_batch: false,
      });
      expect(result.id).toBe('inv-1');
      expect(result.guests).toHaveLength(1);
    });

    it('envía p_known_guest_ids como arreglo vacío por defecto', async () => {
      mockSupabase.client.rpc.mockResolvedValue({
        data: {
          id: 'inv-new',
          event_id: 'event-1',
          batch_id: null,
          group_name: 'Familia Ejemplo',
          kind: 'group',
          phone: '+573001234567',
          code: 'CODE2',
          created_at: '2026-10-25T00:00:00Z',
          updated_at: '2026-10-25T00:00:00Z',
          whatsapp_sent_at: null,
          guests: [],
        },
        error: null,
      });

      await repository.save('event-1', 'inv-new', input);

      expect(mockSupabase.client.rpc).toHaveBeenCalledWith(
        'save_invitation',
        expect.objectContaining({
          p_known_guest_ids: [],
          p_batch_id: null,
          p_set_batch: false,
        }),
      );
    });

    it('envía p_set_batch y p_batch_id según el valor de batch_id', async () => {
      mockSupabase.client.rpc.mockResolvedValue({
        data: {
          id: 'inv-1',
          event_id: 'event-1',
          batch_id: null,
          group_name: 'Familia Ejemplo',
          kind: 'group',
          phone: null,
          code: 'CODE1',
          created_at: '2026-10-25T00:00:00Z',
          updated_at: '2026-10-25T00:00:00Z',
          whatsapp_sent_at: null,
          guests: [],
        },
        error: null,
      });

      await repository.save('event-1', 'inv-1', { ...input, phone: null, batch_id: undefined });
      expect(mockSupabase.client.rpc).toHaveBeenLastCalledWith(
        'save_invitation',
        expect.objectContaining({
          p_batch_id: null,
          p_set_batch: false,
        }),
      );

      await repository.save('event-1', 'inv-1', { ...input, phone: null, batch_id: null });
      expect(mockSupabase.client.rpc).toHaveBeenLastCalledWith(
        'save_invitation',
        expect.objectContaining({
          p_batch_id: null,
          p_set_batch: true,
        }),
      );

      await repository.save('event-1', 'inv-1', { ...input, phone: null, batch_id: 'batch-2' });
      expect(mockSupabase.client.rpc).toHaveBeenLastCalledWith(
        'save_invitation',
        expect.objectContaining({
          p_batch_id: 'batch-2',
          p_set_batch: true,
        }),
      );
    });

    it('ordena los invitados por sort_order y created_at', async () => {
      mockSupabase.client.rpc.mockResolvedValue({
        data: {
          id: 'inv-1',
          event_id: 'event-1',
          batch_id: null,
          group_name: 'Familia Ejemplo',
          kind: 'group',
          phone: null,
          code: 'CODE1',
          created_at: '2026-10-25T00:00:00Z',
          updated_at: '2026-10-25T00:00:00Z',
          whatsapp_sent_at: null,
          guests: [
            {
              id: 'g-2',
              invitation_id: 'inv-1',
              full_name: 'Segundo',
              sort_order: 1,
              created_at: '2026-10-25T00:00:00Z',
            },
            {
              id: 'g-1',
              invitation_id: 'inv-1',
              full_name: 'Primero',
              sort_order: 0,
              created_at: '2026-10-25T00:00:00Z',
            },
          ],
        },
        error: null,
      });

      const res = await repository.save('event-1', 'inv-1', {
        ...input,
        phone: null,
      });

      expect(res.guests[0].id).toBe('g-1');
      expect(res.guests[1].id).toBe('g-2');
    });

    it('lanza error traducido cuando la rpc falla', async () => {
      mockSupabase.client.rpc.mockResolvedValue({
        data: null,
        error: { message: 'invitation_event_mismatch' },
      });

      await expect(repository.save('event-1', 'inv-1', input)).rejects.toThrow(
        'No pudimos guardar el cambio. Inténtalo de nuevo.',
      );
    });
  });

  describe('list', () => {
    it('lista, copia batch_id y ordena alfabéticamente por group_name', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'inv-b',
              event_id: 'event-1',
              batch_id: 'batch-2',
              group_name: 'Familia Zapata',
              kind: 'group',
              phone: null,
              code: 'ZAP',
              created_at: '2026-10-25T00:00:00Z',
              updated_at: '2026-10-25T00:00:00Z',
              whatsapp_sent_at: null,
              guests: [],
            },
            {
              id: 'inv-a',
              event_id: 'event-1',
              batch_id: null,
              group_name: 'Familia Álvarez',
              kind: 'group',
              phone: null,
              code: 'ALV',
              created_at: '2026-10-25T00:00:00Z',
              updated_at: '2026-10-25T00:00:00Z',
              whatsapp_sent_at: null,
              guests: [],
            },
          ],
          error: null,
        }),
      };
      mockSupabase.client.from.mockReturnValue(mockQuery);

      const items = await repository.list('event-1');
      expect(items[0].group_name).toBe('Familia Álvarez');
      expect(items[0].batch_id).toBeNull();
      expect(items[1].group_name).toBe('Familia Zapata');
      expect(items[1].batch_id).toBe('batch-2');
    });
  });

  describe('get', () => {
    it('copia batch_id al consultar una invitación', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: 'inv-1',
            event_id: 'event-1',
            batch_id: 'batch-1',
            group_name: 'Familia Ejemplo',
            kind: 'group',
            phone: null,
            code: 'CODE1',
            created_at: '2026-10-25T00:00:00Z',
            updated_at: '2026-10-25T00:00:00Z',
            whatsapp_sent_at: null,
            guests: [],
          },
          error: null,
        }),
      };
      mockSupabase.client.from.mockReturnValue(mockQuery);

      const item = await repository.get('inv-1');
      expect(item?.batch_id).toBe('batch-1');
    });
  });

  describe('guestLink', () => {
    it('genera enlace de invitado con el código', () => {
      const link = repository.guestLink('ABC123XYZ');
      expect(link).toContain('ABC123XYZ');
    });
  });
});
