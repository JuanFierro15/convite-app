import { TestBed } from '@angular/core/testing';
import { InvitationBatchRow } from '../models/invitation-batches';
import { SupabaseService } from '../supabase/supabase.service';
import { CONNECTION_ERROR_MESSAGE } from '../utils/messages';
import { LOAD_ERROR_MESSAGE } from './errors';
import { InvitationBatchesRepository } from './invitation-batches.repository';

describe('InvitationBatchesRepository', () => {
  let repository: InvitationBatchesRepository;
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

    repository = TestBed.inject(InvitationBatchesRepository);
  });

  describe('list', () => {
    it('ordena por rsvp_deadline ascendente y desempata por created_at', async () => {
      const rows: InvitationBatchRow[] = [
        {
          id: 'b-3',
          event_id: 'evt-1',
          name: 'Última',
          rsvp_deadline: '2026-11-24T23:59:59-05:00',
          created_at: '2026-10-01T10:00:00Z',
        },
        {
          id: 'b-2',
          event_id: 'evt-1',
          name: 'Empate tarde',
          rsvp_deadline: '2026-11-20T23:59:59-05:00',
          created_at: '2026-10-03T10:00:00Z',
        },
        {
          id: 'b-1',
          event_id: 'evt-1',
          name: 'Empate temprano',
          rsvp_deadline: '2026-11-20T23:59:59-05:00',
          created_at: '2026-10-02T10:00:00Z',
        },
      ];

      const eq = vi.fn().mockResolvedValue({ data: rows, error: null });
      const select = vi.fn().mockReturnValue({ eq });
      mockSupabase.client.from.mockReturnValue({ select });

      const result = await repository.list('evt-1');

      expect(mockSupabase.client.from).toHaveBeenCalledWith('invitation_batches');
      expect(select).toHaveBeenCalledWith('*');
      expect(eq).toHaveBeenCalledWith('event_id', 'evt-1');
      expect(result.map((b) => b.id)).toEqual(['b-1', 'b-2', 'b-3']);
    });

    it('traduce errores de consulta con LOAD_ERROR_MESSAGE y fallos de red con CONNECTION_ERROR_MESSAGE', async () => {
      const eq = vi
        .fn()
        .mockResolvedValueOnce({ data: null, error: { message: 'unexpected_error' } })
        .mockResolvedValueOnce({ data: null, error: { message: 'TypeError: Failed to fetch' } });
      const select = vi.fn().mockReturnValue({ eq });
      mockSupabase.client.from.mockReturnValue({ select });

      await expect(repository.list('evt-1')).rejects.toThrow(LOAD_ERROR_MESSAGE);
      await expect(repository.list('evt-1')).rejects.toThrow(CONNECTION_ERROR_MESSAGE);
    });
  });

  describe('create', () => {
    it('recorta el nombre al insertar y devuelve la fila creada', async () => {
      const created: InvitationBatchRow = {
        id: 'batch-1',
        event_id: 'evt-1',
        name: 'Segunda tanda',
        rsvp_deadline: '2026-11-20T23:59:59-05:00',
        created_at: '2026-10-01T10:00:00Z',
      };

      const single = vi.fn().mockResolvedValue({ data: created, error: null });
      const select = vi.fn().mockReturnValue({ single });
      const insert = vi.fn().mockReturnValue({ select });
      mockSupabase.client.from.mockReturnValue({ insert });

      const result = await repository.create('evt-1', 'batch-1', {
        name: '  Segunda tanda  ',
        rsvp_deadline: '2026-11-20T23:59:59-05:00',
      });

      expect(insert).toHaveBeenCalledWith({
        id: 'batch-1',
        event_id: 'evt-1',
        name: 'Segunda tanda',
        rsvp_deadline: '2026-11-20T23:59:59-05:00',
      });
      expect(result).toEqual(created);
    });

    it('en reintento con 23505 e invitation_batches_pkey devuelve la fila existente', async () => {
      const existing: InvitationBatchRow = {
        id: 'batch-1',
        event_id: 'evt-1',
        name: 'Segunda tanda',
        rsvp_deadline: '2026-11-20T23:59:59-05:00',
        created_at: '2026-10-01T10:00:00Z',
      };

      const insertSingle = vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "invitation_batches_pkey"',
        },
      });
      const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
      const insert = vi.fn().mockReturnValue({ select: insertSelect });

      const retrySingle = vi.fn().mockResolvedValue({ data: existing, error: null });
      const retryEq = vi.fn().mockReturnValue({ single: retrySingle });
      const retrySelect = vi.fn().mockReturnValue({ eq: retryEq });

      mockSupabase.client.from
        .mockReturnValueOnce({ insert })
        .mockReturnValueOnce({ select: retrySelect });

      const result = await repository.create('evt-1', 'batch-1', {
        name: 'Segunda tanda',
        rsvp_deadline: '2026-11-20T23:59:59-05:00',
      });

      expect(retrySelect).toHaveBeenCalledWith('*');
      expect(retryEq).toHaveBeenCalledWith('id', 'batch-1');
      expect(result).toEqual(existing);
    });

    it('traduce otro 23505 sin invitation_batches_pkey, errores de dominio y fallos de red', async () => {
      const makeInsertMock = (error: unknown) => {
        const single = vi.fn().mockResolvedValue({ data: null, error });
        const select = vi.fn().mockReturnValue({ single });
        const insert = vi.fn().mockReturnValue({ select });
        return { insert };
      };

      mockSupabase.client.from
        .mockReturnValueOnce(
          makeInsertMock({
            code: '23505',
            message: 'duplicate key value violates unique constraint "other_unique_constraint"',
          }),
        )
        .mockReturnValueOnce(makeInsertMock({ message: 'batch_deadline_after_start' }))
        .mockReturnValueOnce(
          makeInsertMock({ message: 'violates check constraint "invitation_batches_name_length"' }),
        )
        .mockReturnValueOnce(makeInsertMock({ message: 'TypeError: Failed to fetch' }));

      await expect(
        repository.create('evt-1', 'batch-1', {
          name: 'Tanda',
          rsvp_deadline: '2026-11-20T23:59:59-05:00',
        }),
      ).rejects.toThrow('No pudimos guardar el cambio. Inténtalo de nuevo.');

      await expect(
        repository.create('evt-1', 'batch-2', {
          name: 'Tanda',
          rsvp_deadline: '2026-12-01T23:59:59-05:00',
        }),
      ).rejects.toThrow(
        'La fecha límite de cada tanda debe ser anterior o igual a la fecha del evento.',
      );

      await expect(
        repository.create('evt-1', 'batch-3', {
          name: '   ',
          rsvp_deadline: '2026-11-20T23:59:59-05:00',
        }),
      ).rejects.toThrow('El nombre de la tanda debe tener entre 1 y 60 caracteres.');

      await expect(
        repository.create('evt-1', 'batch-4', {
          name: 'Tanda',
          rsvp_deadline: '2026-11-20T23:59:59-05:00',
        }),
      ).rejects.toThrow(CONNECTION_ERROR_MESSAGE);
    });
  });

  describe('update', () => {
    it('recorta el nombre al actualizar y traduce errores de escritura', async () => {
      const updated: InvitationBatchRow = {
        id: 'batch-1',
        event_id: 'evt-1',
        name: 'Nombre editado',
        rsvp_deadline: '2026-11-21T23:59:59-05:00',
        created_at: '2026-10-01T10:00:00Z',
      };

      const okSingle = vi.fn().mockResolvedValue({ data: updated, error: null });
      const okSelect = vi.fn().mockReturnValue({ single: okSingle });
      const okEq = vi.fn().mockReturnValue({ select: okSelect });
      const okUpdate = vi.fn().mockReturnValue({ eq: okEq });

      const errSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'batch_deadline_after_start' },
      });
      const errSelect = vi.fn().mockReturnValue({ single: errSingle });
      const errEq = vi.fn().mockReturnValue({ select: errSelect });
      const errUpdate = vi.fn().mockReturnValue({ eq: errEq });

      mockSupabase.client.from
        .mockReturnValueOnce({ update: okUpdate })
        .mockReturnValueOnce({ update: errUpdate });

      const result = await repository.update('batch-1', {
        name: '  Nombre editado  ',
        rsvp_deadline: '2026-11-21T23:59:59-05:00',
      });

      expect(okUpdate).toHaveBeenCalledWith({
        name: 'Nombre editado',
        rsvp_deadline: '2026-11-21T23:59:59-05:00',
      });
      expect(okEq).toHaveBeenCalledWith('id', 'batch-1');
      expect(result).toEqual(updated);

      await expect(
        repository.update('batch-1', {
          name: 'Nombre editado',
          rsvp_deadline: '2026-12-01T23:59:59-05:00',
        }),
      ).rejects.toThrow(
        'La fecha límite de cada tanda debe ser anterior o igual a la fecha del evento.',
      );
    });
  });

  describe('remove', () => {
    it('elimina la tanda y traduce invitations_batch_id_fkey y fallos de red', async () => {
      const eq = vi
        .fn()
        .mockResolvedValueOnce({ error: null })
        .mockResolvedValueOnce({
          error: { message: 'violates foreign key constraint "invitations_batch_id_fkey"' },
        })
        .mockResolvedValueOnce({ error: { message: 'NetworkError when attempting to fetch resource.' } });
      const del = vi.fn().mockReturnValue({ eq });
      mockSupabase.client.from.mockReturnValue({ delete: del });

      await expect(repository.remove('batch-1')).resolves.toBeUndefined();
      expect(eq).toHaveBeenCalledWith('id', 'batch-1');

      await expect(repository.remove('batch-1')).rejects.toThrow(
        'Esta tanda tiene invitaciones. Muévelas a otra tanda antes de borrarla.',
      );

      await expect(repository.remove('batch-1')).rejects.toThrow(CONNECTION_ERROR_MESSAGE);
    });
  });
});
