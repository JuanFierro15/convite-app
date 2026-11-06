import { Injectable, inject } from '@angular/core';
import { TaskExpenseAction, TaskInput, TaskRow } from '../models/tasks';
import { Json } from '../supabase/database.types';
import { SupabaseService } from '../supabase/supabase.service';
import { LOAD_ERROR_MESSAGE, toUserError } from './errors';

@Injectable({ providedIn: 'root' })
export class TasksRepository {
  private readonly supabase = inject(SupabaseService);

  async list(eventId: string): Promise<TaskRow[]> {
    const { data, error } = await this.supabase.client
      .from('tasks')
      .select('*')
      .eq('event_id', eventId);

    if (error) {
      throw toUserError(error, LOAD_ERROR_MESSAGE);
    }

    return data ?? [];
  }

  async setDone(
    taskId: string,
    done: boolean,
  ): Promise<{ id: string; done_at: string | null; done_by: string | null }> {
    const { data, error } = await this.supabase.client.rpc('set_task_done', {
      p_task_id: taskId,
      p_done: done,
    });

    if (error) {
      throw toUserError(error);
    }

    return data as unknown as { id: string; done_at: string | null; done_by: string | null };
  }

  async save(
    taskId: string,
    eventId: string,
    input: TaskInput,
    expense: TaskExpenseAction,
  ): Promise<TaskRow> {
    let pExpenseAction = 'keep';
    let pExpense: Record<string, unknown> | null = null;

    switch (expense.action) {
      case 'keep':
        pExpenseAction = 'keep';
        pExpense = null;
        break;
      case 'unlink':
        pExpenseAction = 'unlink';
        pExpense = null;
        break;
      case 'new':
        pExpenseAction = 'new';
        pExpense = {
          id: expense.expense.id,
          category_id: expense.expense.category_id,
          description: expense.expense.description.trim(),
          amount_cop: expense.expense.amount_cop,
        };
        break;
      case 'link':
        pExpenseAction = 'link';
        pExpense = { id: expense.expense_id };
        break;
    }

    // El tipo generado en database.types.ts exige string, pero la funcion SQL acepta null.
    const pNote = (input.note ?? null) as unknown as string;
    const pAssigneeProfileId = (input.assignee_profile_id ?? null) as unknown as string;

    const { data, error } = await this.supabase.client.rpc('save_task', {
      p_task_id: taskId,
      p_event_id: eventId,
      p_title: input.title.trim(),
      p_note: pNote,
      p_assignee_profile_id: pAssigneeProfileId,
      p_due_date: input.due_date,
      p_expense_action: pExpenseAction,
      p_expense: pExpense as unknown as Json,
    });

    if (error) {
      throw toUserError(error);
    }

    return data as unknown as TaskRow;
  }

  async remove(taskId: string, deleteExpense: boolean): Promise<{ deleted_expense: boolean }> {
    const { data, error } = await this.supabase.client.rpc('delete_task', {
      p_task_id: taskId,
      p_delete_expense: deleteExpense,
    });

    if (error) {
      throw toUserError(error);
    }

    return data as unknown as { deleted_expense: boolean };
  }
}
