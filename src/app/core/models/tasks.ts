import { Tables } from '../supabase/database.types';

export type TaskRow = Tables<'tasks'>;

export interface TaskInput {
  title: string;
  note: string | null;
  assignee_profile_id: string | null;
  due_date: string;
}

export type TaskExpenseAction =
  | { action: 'keep' }
  | { action: 'unlink' }
  | { action: 'new'; expense: { id: string; category_id: string; description: string; amount_cop: number } }
  | { action: 'link'; expense_id: string };

export interface TaskGroups {
  overdue: TaskRow[];
  upcoming: TaskRow[];
  done: TaskRow[];
}

// 'all' = Todas; 'unassigned' = Sin asignar; cualquier otro valor es el id de un perfil.
export type TaskProfileFilter = string;

// Solo existe para propietarios.
export interface TaskExpenseLink {
  task_id: string;
  expense_id: string;
  description: string;
  amount_cop: number;
  paid_cop: number;
}

export interface FreeExpense {
  id: string;
  description: string;
  amount_cop: number;
}
