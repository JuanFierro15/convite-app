import { Tables } from '../supabase/database.types';

export type ExpenseCategoryRow = Tables<'expense_categories'>;
export type ExpenseRow = Tables<'expenses'>;
export type ExpensePaymentRow = Tables<'expense_payments'>;
export type ExpenseStatus = 'pending' | 'partial' | 'paid';

export interface ExpenseTaskSummary {
  id: string;
  title: string;
  done_at: string | null;
}

export interface ExpenseWithPayments extends ExpenseRow {
  payments: ExpensePaymentRow[];
  task: ExpenseTaskSummary | null;
}

export interface ExpenseInput {
  category_id: string;
  description: string;
  amount_cop: number;
  note: string | null;
}

export interface PaymentInput {
  expense_id: string;
  amount_cop: number;
  paid_on: string;
  paid_by_profile_id: string;
}

export interface BudgetSummary {
  budget: number | null;
  committed: number;
  paid: number;
  toPay: number;
  available: number | null;
  overBy: number;
}

export interface CategoryBreakdown {
  category_id: string;
  name: string;
  committed: number;
  paid: number;
}

export interface ProfileBreakdown {
  profile_id: string;
  name: string;
  paid: number;
}

export interface TaskExpenseLink {
  expense_id: string;
  amount_cop: number;
  paid_cop: number;
}
