import { Injectable, inject } from '@angular/core';
import {
  ExpenseCategoryRow,
  ExpenseInput,
  ExpensePaymentRow,
  ExpenseRow,
  ExpenseTaskSummary,
  ExpenseWithPayments,
  PaymentInput,
} from '../models/budget';
import { FreeExpense, TaskExpenseLink } from '../models/tasks';
import { SupabaseService } from '../supabase/supabase.service';
import { paidTotal } from '../utils/expense-status';
import { LOAD_ERROR_MESSAGE, toUserError } from './errors';

const SUGGESTED_EXPENSE_CATEGORIES: readonly string[] = [
  'Lugar',
  'Decoración',
  'Comida y bebidas',
  'Torta y postres',
  'Recordatorios',
  'Entretenimiento',
  'Otros',
];

function mapExpenseWithPayments(row: Record<string, unknown>): ExpenseWithPayments {
  const { expense_payments, tasks, ...rest } = row;
  const rawPayments = (expense_payments ?? []) as ExpensePaymentRow[];
  const payments = [...rawPayments].sort((a, b) => {
    const dateDiff = a.paid_on.localeCompare(b.paid_on);
    if (dateDiff !== 0) {
      return dateDiff;
    }
    return a.created_at.localeCompare(b.created_at);
  });

  const rawTask = Array.isArray(tasks) ? tasks[0] : tasks;
  const taskObj = rawTask && typeof rawTask === 'object' ? (rawTask as Record<string, unknown>) : null;
  const task: ExpenseTaskSummary | null =
    taskObj && typeof taskObj['id'] === 'string'
      ? {
          id: taskObj['id'],
          title: String(taskObj['title'] ?? ''),
          done_at: typeof taskObj['done_at'] === 'string' ? taskObj['done_at'] : null,
        }
      : null;

  return {
    ...(rest as unknown as ExpenseRow),
    payments,
    task,
  };
}

@Injectable({ providedIn: 'root' })
export class BudgetRepository {
  private readonly supabase = inject(SupabaseService);

  async listCategories(eventId: string): Promise<ExpenseCategoryRow[]> {
    const { data, error } = await this.supabase.client
      .from('expense_categories')
      .select('*')
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      throw toUserError(error, LOAD_ERROR_MESSAGE);
    }

    return data ?? [];
  }

  async createCategory(
    eventId: string,
    name: string,
    sortOrder: number
  ): Promise<ExpenseCategoryRow> {
    const { data, error } = await this.supabase.client
      .from('expense_categories')
      .insert({
        event_id: eventId,
        name: name.trim(),
        sort_order: sortOrder,
      })
      .select('*')
      .single();

    if (error) {
      throw toUserError(error);
    }

    return data;
  }

  async renameCategory(id: string, name: string): Promise<ExpenseCategoryRow> {
    const { data, error } = await this.supabase.client
      .from('expense_categories')
      .update({
        name: name.trim(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw toUserError(error);
    }

    return data;
  }

  async removeCategory(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('expense_categories')
      .delete()
      .eq('id', id);

    if (error) {
      throw toUserError(error);
    }
  }

  async swapCategoryOrder(a: ExpenseCategoryRow, b: ExpenseCategoryRow): Promise<void> {
    const orderA = b.sort_order;
    const orderB = a.sort_order === b.sort_order ? a.sort_order + 1 : a.sort_order;

    const { error: errorA } = await this.supabase.client
      .from('expense_categories')
      .update({ sort_order: orderA })
      .eq('id', a.id);

    if (errorA) {
      throw toUserError(errorA);
    }

    const { error: errorB } = await this.supabase.client
      .from('expense_categories')
      .update({ sort_order: orderB })
      .eq('id', b.id);

    if (errorB) {
      throw toUserError(errorB);
    }
  }

  async addSuggestedCategories(eventId: string): Promise<number> {
    const { data: existing, error: fetchError } = await this.supabase.client
      .from('expense_categories')
      .select('name, sort_order')
      .eq('event_id', eventId);

    if (fetchError) {
      throw toUserError(fetchError);
    }

    const existingNames = new Set((existing ?? []).map((c) => c.name.trim().toLowerCase()));
    const missing = SUGGESTED_EXPENSE_CATEGORIES.filter(
      (name) => !existingNames.has(name.toLowerCase())
    );

    if (missing.length === 0) {
      return 0;
    }

    const maxOrder = (existing ?? []).reduce(
      (max, c) => Math.max(max, c.sort_order),
      -1
    );
    let nextOrder = maxOrder + 1;

    const rowsToInsert = missing.map((name) => ({
      event_id: eventId,
      name,
      sort_order: nextOrder++,
    }));

    const { error: insertError } = await this.supabase.client
      .from('expense_categories')
      .insert(rowsToInsert);

    if (insertError) {
      throw toUserError(insertError);
    }

    return rowsToInsert.length;
  }

  async listExpenses(eventId: string): Promise<ExpenseWithPayments[]> {
    const { data, error } = await this.supabase.client
      .from('expenses')
      .select('*, expense_payments(*), tasks!expenses_task_same_event(id, title, done_at)')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });

    if (error) {
      throw toUserError(error, LOAD_ERROR_MESSAGE);
    }

    return (data ?? []).map((row) => mapExpenseWithPayments(row as unknown as Record<string, unknown>));
  }

  async getExpense(id: string): Promise<ExpenseWithPayments | null> {
    const { data, error } = await this.supabase.client
      .from('expenses')
      .select('*, expense_payments(*), tasks!expenses_task_same_event(id, title, done_at)')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw toUserError(error, LOAD_ERROR_MESSAGE);
    }

    if (!data) {
      return null;
    }

    return mapExpenseWithPayments(data as unknown as Record<string, unknown>);
  }

  async createExpense(eventId: string, input: ExpenseInput): Promise<ExpenseRow> {
    const trimmedNote = input.note?.trim();

    const { data, error } = await this.supabase.client
      .from('expenses')
      .insert({
        event_id: eventId,
        category_id: input.category_id,
        description: input.description.trim(),
        amount_cop: input.amount_cop,
        note: trimmedNote ? trimmedNote : null,
      })
      .select('*')
      .single();

    if (error) {
      throw toUserError(error);
    }

    return data;
  }

  async updateExpense(id: string, input: ExpenseInput): Promise<ExpenseRow> {
    const trimmedNote = input.note?.trim();

    const { data, error } = await this.supabase.client
      .from('expenses')
      .update({
        category_id: input.category_id,
        description: input.description.trim(),
        amount_cop: input.amount_cop,
        note: trimmedNote ? trimmedNote : null,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw toUserError(error);
    }

    return data;
  }

  async removeExpense(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('expenses')
      .delete()
      .eq('id', id);

    if (error) {
      throw toUserError(error);
    }
  }

  async committedTotal(eventId: string): Promise<number> {
    const { data, error } = await this.supabase.client
      .from('expenses')
      .select('amount_cop')
      .eq('event_id', eventId);

    if (error) {
      throw toUserError(error, LOAD_ERROR_MESSAGE);
    }

    return (data ?? []).reduce((sum, row) => sum + row.amount_cop, 0);
  }

  async addPayment(eventId: string, input: PaymentInput): Promise<ExpensePaymentRow> {
    const { data, error } = await this.supabase.client
      .from('expense_payments')
      .insert({
        event_id: eventId,
        expense_id: input.expense_id,
        amount_cop: input.amount_cop,
        paid_on: input.paid_on,
        paid_by_profile_id: input.paid_by_profile_id,
      })
      .select('*')
      .single();

    if (error) {
      throw toUserError(error);
    }

    return data;
  }

  async removePayment(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('expense_payments')
      .delete()
      .eq('id', id);

    if (error) {
      throw toUserError(error);
    }
  }

  async linksForTasks(eventId: string): Promise<TaskExpenseLink[]> {
    const { data, error } = await this.supabase.client
      .from('expenses')
      .select('id, task_id, description, amount_cop, expense_payments(amount_cop)')
      .eq('event_id', eventId)
      .not('task_id', 'is', null);

    if (error) {
      throw toUserError(error, LOAD_ERROR_MESSAGE);
    }

    return (data ?? []).map((row) => {
      const payments = (row.expense_payments ?? []) as { amount_cop: number }[];
      return {
        task_id: row.task_id as string,
        expense_id: row.id,
        description: row.description,
        amount_cop: row.amount_cop,
        paid_cop: paidTotal(payments),
      };
    });
  }

  async freeExpenses(eventId: string): Promise<FreeExpense[]> {
    const { data, error } = await this.supabase.client
      .from('expenses')
      .select('id, description, amount_cop')
      .eq('event_id', eventId)
      .is('task_id', null);

    if (error) {
      throw toUserError(error, LOAD_ERROR_MESSAGE);
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      description: row.description,
      amount_cop: row.amount_cop,
    }));
  }
}
