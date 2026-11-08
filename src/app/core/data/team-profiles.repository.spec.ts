import { TestBed } from '@angular/core/testing';
import { SupabaseService } from '../supabase/supabase.service';
import { TeamProfilesRepository } from './team-profiles.repository';
import { TeamProfileRow } from '../models/team-profiles';
import { LOAD_ERROR_MESSAGE } from './errors';

describe('TeamProfilesRepository', () => {
  let repository: TeamProfilesRepository;
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

    repository = TestBed.inject(TeamProfilesRepository);
  });

  describe('list', () => {
    it('queries profiles ordered by sort_order and name, including archived', async () => {
      const mockOrderName = vi.fn().mockResolvedValue({
        data: [
          {
            id: 'prof-1',
            team_id: 'team-1',
            name: 'Juan',
            sort_order: 0,
            archived_at: null,
            created_at: '',
          },
          {
            id: 'prof-2',
            team_id: 'team-1',
            name: 'Tía Gloria',
            sort_order: 1,
            archived_at: '2026-11-01T00:00:00Z',
            created_at: '',
          },
        ],
        error: null,
      });
      const mockOrderSort = vi.fn().mockReturnValue({ order: mockOrderName });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrderSort });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

      mockSupabase.client.from.mockReturnValue({ select: mockSelect });

      const result = await repository.list('team-1');

      expect(mockSupabase.client.from).toHaveBeenCalledWith('team_profiles');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockEq).toHaveBeenCalledWith('team_id', 'team-1');
      expect(mockOrderSort).toHaveBeenCalledWith('sort_order', { ascending: true });
      expect(mockOrderName).toHaveBeenCalledWith('name', { ascending: true });
      expect(result).toHaveLength(2);
      expect(result[1].archived_at).not.toBeNull();
    });

    it('throws toUserError with LOAD_ERROR_MESSAGE on database failure', async () => {
      const mockOrderName = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'db_error' },
      });
      const mockOrderSort = vi.fn().mockReturnValue({ order: mockOrderName });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrderSort });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

      mockSupabase.client.from.mockReturnValue({ select: mockSelect });

      await expect(repository.list('team-1')).rejects.toThrow(LOAD_ERROR_MESSAGE);
    });
  });

  describe('create', () => {
    it('trims profile name and returns created row', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          id: 'prof-1',
          team_id: 'team-1',
          name: 'Laura',
          sort_order: 2,
          archived_at: null,
          created_at: '',
        },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      mockSupabase.client.from.mockReturnValue({ insert: mockInsert });

      const result = await repository.create('prof-1', 'team-1', '  Laura  ', 2);

      expect(mockInsert).toHaveBeenCalledWith({
        id: 'prof-1',
        team_id: 'team-1',
        name: 'Laura',
        sort_order: 2,
      });
      expect(result.name).toBe('Laura');
    });

    it('create ante 23505 devuelve la fila existente', async () => {
      const existingProfile: TeamProfileRow = {
        id: 'prof-1',
        team_id: 'team-1',
        name: 'Laura',
        sort_order: 2,
        archived_at: null,
        created_at: '2026-11-01T10:00:00Z',
      };
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate key value' },
      });
      const mockInsertSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockInsertSelect });

      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: existingProfile,
        error: null,
      });
      const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

      mockSupabase.client.from.mockReturnValue({
        insert: mockInsert,
        select: mockSelect,
      });

      const result = await repository.create('prof-1', 'team-1', 'Laura', 2);

      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockEq).toHaveBeenCalledWith('id', 'prof-1');
      expect(result).toEqual(existingProfile);
    });

    it('create ante 23505 sin fila visible lanza el error', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate key value' },
      });
      const mockInsertSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockInsertSelect });

      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      });
      const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

      mockSupabase.client.from.mockReturnValue({
        insert: mockInsert,
        select: mockSelect,
      });

      await expect(
        repository.create('prof-1', 'team-1', 'Laura', 2),
      ).rejects.toThrow();
    });

    it('translates duplicate active name error with toUserError', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'duplicate key value violates unique constraint "team_profiles_active_name_key"' },
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      mockSupabase.client.from.mockReturnValue({ insert: mockInsert });

      await expect(repository.create('prof-1', 'team-1', 'Laura', 0)).rejects.toThrow(
        'Ya hay un perfil activo con ese nombre.',
      );
    });
  });

  describe('rename', () => {
    it('trims name on update', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'prof-1', name: 'Nuevo Nombre' },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabase.client.from.mockReturnValue({ update: mockUpdate });

      const result = await repository.rename('prof-1', '  Nuevo Nombre  ');

      expect(mockUpdate).toHaveBeenCalledWith({ name: 'Nuevo Nombre' });
      expect(mockEq).toHaveBeenCalledWith('id', 'prof-1');
      expect(result.name).toBe('Nuevo Nombre');
    });
  });

  describe('setArchived', () => {
    it('sets archived_at timestamp when archiving', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'prof-1', archived_at: '2026-11-05T12:00:00.000Z' },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabase.client.from.mockReturnValue({ update: mockUpdate });

      const result = await repository.setArchived('prof-1', true);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ archived_at: expect.any(String) }),
      );
      expect(mockEq).toHaveBeenCalledWith('id', 'prof-1');
      expect(result.archived_at).toBeTruthy();
    });

    it('sets archived_at to null when unarchiving', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'prof-1', archived_at: null },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabase.client.from.mockReturnValue({ update: mockUpdate });

      const result = await repository.setArchived('prof-1', false);

      expect(mockUpdate).toHaveBeenCalledWith({ archived_at: null });
      expect(result.archived_at).toBeNull();
    });
  });

  describe('remove', () => {
    it('deletes profile by id', async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockDelete = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabase.client.from.mockReturnValue({ delete: mockDelete });

      await repository.remove('prof-1');

      expect(mockDelete).toHaveBeenCalled();
      expect(mockEq).toHaveBeenCalledWith('id', 'prof-1');
    });

    it('translates used profile foreign key error with toUserError', async () => {
      const mockEq = vi.fn().mockResolvedValue({
        error: { message: 'violates foreign key constraint "tasks_assignee_profile_id_fkey"' },
      });
      const mockDelete = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabase.client.from.mockReturnValue({ delete: mockDelete });

      await expect(repository.remove('prof-1')).rejects.toThrow(
        'Este perfil ya se usó. Puedes archivarlo.',
      );
    });
  });

  describe('swapOrder', () => {
    it('swaps sort_order values sequentially when different', async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabase.client.from.mockReturnValue({ update: mockUpdate });

      const profA: TeamProfileRow = {
        id: 'prof-a',
        team_id: 'team-1',
        name: 'A',
        sort_order: 3,
        archived_at: null,
        created_at: '',
      };
      const profB: TeamProfileRow = {
        id: 'prof-b',
        team_id: 'team-1',
        name: 'B',
        sort_order: 7,
        archived_at: null,
        created_at: '',
      };

      await repository.swapOrder(profA, profB);

      expect(mockUpdate).toHaveBeenNthCalledWith(1, { sort_order: 7 });
      expect(mockEq).toHaveBeenNthCalledWith(1, 'id', 'prof-a');
      expect(mockUpdate).toHaveBeenNthCalledWith(2, { sort_order: 3 });
      expect(mockEq).toHaveBeenNthCalledWith(2, 'id', 'prof-b');
    });

    it('assigns b.sort_order to a and a.sort_order + 1 to b when values are equal', async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabase.client.from.mockReturnValue({ update: mockUpdate });

      const profA: TeamProfileRow = {
        id: 'prof-a',
        team_id: 'team-1',
        name: 'A',
        sort_order: 4,
        archived_at: null,
        created_at: '',
      };
      const profB: TeamProfileRow = {
        id: 'prof-b',
        team_id: 'team-1',
        name: 'B',
        sort_order: 4,
        archived_at: null,
        created_at: '',
      };

      await repository.swapOrder(profA, profB);

      expect(mockUpdate).toHaveBeenNthCalledWith(1, { sort_order: 4 });
      expect(mockEq).toHaveBeenNthCalledWith(1, 'id', 'prof-a');
      expect(mockUpdate).toHaveBeenNthCalledWith(2, { sort_order: 5 });
      expect(mockEq).toHaveBeenNthCalledWith(2, 'id', 'prof-b');
    });
  });

  describe('canManage', () => {
    it('calls RPC can_manage_profiles and returns boolean', async () => {
      mockSupabase.client.rpc.mockResolvedValue({ data: true, error: null });

      const canManage = await repository.canManage('event-1');

      expect(mockSupabase.client.rpc).toHaveBeenCalledWith('can_manage_profiles', {
        p_event_id: 'event-1',
      });
      expect(canManage).toBe(true);
    });

    it('throws toUserError with LOAD_ERROR_MESSAGE on RPC failure', async () => {
      mockSupabase.client.rpc.mockResolvedValue({
        data: null,
        error: { message: 'rpc_failure' },
      });

      await expect(repository.canManage('event-1')).rejects.toThrow(LOAD_ERROR_MESSAGE);
    });
  });
});
