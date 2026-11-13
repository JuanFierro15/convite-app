import { TestBed } from '@angular/core/testing';
import { TaskInput, TaskRow } from '../models/tasks';
import { SupabaseService } from '../supabase/supabase.service';
import { LOAD_ERROR_MESSAGE } from './errors';
import { TasksRepository } from './tasks.repository';

describe('TasksRepository', () => {
  let repository: TasksRepository;
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

    repository = TestBed.inject(TasksRepository);
  });

  describe('list', () => {
    it('queries tasks table by event_id and never calls from("expenses")', async () => {
      const mockTasks: TaskRow[] = [
        {
          id: 'task-1',
          event_id: 'event-1',
          title: 'Encargar centros de mesa',
          note: null,
          assignee_profile_id: null,
          due_date: '2026-11-20',
          done_at: null,
          done_by: null,
          created_at: '2026-11-01T10:00:00Z',
          updated_at: '2026-11-01T10:00:00Z',
        },
      ];

      const mockEq = vi.fn().mockResolvedValue({ data: mockTasks, error: null });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabase.client.from.mockReturnValue({ select: mockSelect });

      const result = await repository.list('event-1');

      expect(mockSupabase.client.from).toHaveBeenCalledWith('tasks');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockEq).toHaveBeenCalledWith('event_id', 'event-1');
      expect(result).toEqual(mockTasks);

      expect(mockSupabase.client.from).not.toHaveBeenCalledWith('expenses');
    });

    it('translates database error using LOAD_ERROR_MESSAGE', async () => {
      const mockEq = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'connection_failed' },
      });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabase.client.from.mockReturnValue({ select: mockSelect });

      await expect(repository.list('event-1')).rejects.toThrow(LOAD_ERROR_MESSAGE);
    });
  });

  describe('setDone', () => {
    it('calls set_task_done RPC with task id and done boolean', async () => {
      const mockResult = {
        id: 'task-1',
        done_at: '2026-11-20T15:00:00Z',
        done_by: 'user-1',
      };
      mockSupabase.client.rpc.mockResolvedValue({ data: mockResult, error: null });

      const result = await repository.setDone('task-1', true);

      expect(mockSupabase.client.rpc).toHaveBeenCalledWith('set_task_done', {
        p_task_id: 'task-1',
        p_done: true,
      });
      expect(result).toEqual(mockResult);
    });

    it('converts RPC error to user error', async () => {
      mockSupabase.client.rpc.mockResolvedValue({
        data: null,
        error: { message: 'task_not_found' },
      });

      await expect(repository.setDone('missing-task', false)).rejects.toThrow();
    });
  });

  describe('save', () => {
    const baseInput: TaskInput = {
      title: '  Comprar globos  ',
      note: '  Pasteles y dorados  ',
      assignee_profile_id: 'prof-1',
      due_date: '2026-11-25',
    };

    const mockSavedRow: TaskRow = {
      id: 'task-1',
      event_id: 'event-1',
      title: 'Comprar globos',
      note: 'Pasteles y dorados',
      assignee_profile_id: 'prof-1',
      due_date: '2026-11-25',
      done_at: null,
      done_by: null,
      created_at: '2026-11-01T10:00:00Z',
      updated_at: '2026-11-01T10:00:00Z',
    };

    it('handles expense action "keep"', async () => {
      mockSupabase.client.rpc.mockResolvedValue({ data: mockSavedRow, error: null });

      const result = await repository.save('task-1', 'event-1', baseInput, { action: 'keep' });

      expect(mockSupabase.client.rpc).toHaveBeenCalledWith('save_task', {
        p_task_id: 'task-1',
        p_event_id: 'event-1',
        p_title: 'Comprar globos',
        p_note: '  Pasteles y dorados  ',
        p_assignee_profile_id: 'prof-1',
        p_due_date: '2026-11-25',
        p_expense_action: 'keep',
        p_expense: null,
      });
      expect(result).toEqual(mockSavedRow);
    });

    it('handles expense action "unlink"', async () => {
      mockSupabase.client.rpc.mockResolvedValue({ data: mockSavedRow, error: null });

      await repository.save('task-1', 'event-1', baseInput, { action: 'unlink' });

      expect(mockSupabase.client.rpc).toHaveBeenCalledWith('save_task', {
        p_task_id: 'task-1',
        p_event_id: 'event-1',
        p_title: 'Comprar globos',
        p_note: '  Pasteles y dorados  ',
        p_assignee_profile_id: 'prof-1',
        p_due_date: '2026-11-25',
        p_expense_action: 'unlink',
        p_expense: null,
      });
    });

    it('handles expense action "new" with trimmed description', async () => {
      mockSupabase.client.rpc.mockResolvedValue({ data: mockSavedRow, error: null });

      await repository.save('task-1', 'event-1', baseInput, {
        action: 'new',
        expense: {
          id: 'exp-1',
          category_id: 'cat-1',
          description: '  Globos metalizados  ',
          amount_cop: 50000,
        },
      });

      expect(mockSupabase.client.rpc).toHaveBeenCalledWith('save_task', {
        p_task_id: 'task-1',
        p_event_id: 'event-1',
        p_title: 'Comprar globos',
        p_note: '  Pasteles y dorados  ',
        p_assignee_profile_id: 'prof-1',
        p_due_date: '2026-11-25',
        p_expense_action: 'new',
        p_expense: {
          id: 'exp-1',
          category_id: 'cat-1',
          description: 'Globos metalizados',
          amount_cop: 50000,
        },
      });
    });

    it('handles expense action "link"', async () => {
      mockSupabase.client.rpc.mockResolvedValue({ data: mockSavedRow, error: null });

      await repository.save('task-1', 'event-1', baseInput, {
        action: 'link',
        expense_id: 'exp-existing',
      });

      expect(mockSupabase.client.rpc).toHaveBeenCalledWith('save_task', {
        p_task_id: 'task-1',
        p_event_id: 'event-1',
        p_title: 'Comprar globos',
        p_note: '  Pasteles y dorados  ',
        p_assignee_profile_id: 'prof-1',
        p_due_date: '2026-11-25',
        p_expense_action: 'link',
        p_expense: { id: 'exp-existing' },
      });
    });

    it('preserves null values for note and assignee_profile_id', async () => {
      mockSupabase.client.rpc.mockResolvedValue({ data: mockSavedRow, error: null });

      const inputWithNulls: TaskInput = {
        title: 'Tarea sin nota ni responsable',
        note: null,
        assignee_profile_id: null,
        due_date: '2026-11-25',
      };

      await repository.save('task-2', 'event-1', inputWithNulls, { action: 'keep' });

      expect(mockSupabase.client.rpc).toHaveBeenCalledWith('save_task', {
        p_task_id: 'task-2',
        p_event_id: 'event-1',
        p_title: 'Tarea sin nota ni responsable',
        p_note: null,
        p_assignee_profile_id: null,
        p_due_date: '2026-11-25',
        p_expense_action: 'keep',
        p_expense: null,
      });
    });

    it('translates error from save_task RPC using toUserError', async () => {
      mockSupabase.client.rpc.mockResolvedValue({
        data: null,
        error: { message: 'expense_already_linked' },
      });

      await expect(
        repository.save('task-1', 'event-1', baseInput, { action: 'keep' }),
      ).rejects.toThrow();
    });
  });

  describe('remove', () => {
    it('calls delete_task RPC with deleteExpense flag', async () => {
      mockSupabase.client.rpc.mockResolvedValue({
        data: { deleted_expense: true },
        error: null,
      });

      const result = await repository.remove('task-1', true);

      expect(mockSupabase.client.rpc).toHaveBeenCalledWith('delete_task', {
        p_task_id: 'task-1',
        p_delete_expense: true,
      });
      expect(result).toEqual({ deleted_expense: true });
    });

    it('translates error from delete_task RPC using toUserError', async () => {
      mockSupabase.client.rpc.mockResolvedValue({
        data: null,
        error: { message: 'task_not_found' },
      });

      await expect(repository.remove('missing-task', false)).rejects.toThrow();
    });
  });
});
