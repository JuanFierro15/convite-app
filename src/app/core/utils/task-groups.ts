import {
  TaskExpenseLink,
  TaskGroups,
  TaskProfileFilter,
  TaskRow,
} from '../models/tasks';
import { formatDayMonth } from './dates';

export function taskIsOverdue(task: TaskRow, today: string): boolean {
  return task.done_at === null && task.due_date < today;
}

export function groupTasks(tasks: readonly TaskRow[], today: string): TaskGroups {
  const overdue: TaskRow[] = [];
  const upcoming: TaskRow[] = [];
  const done: TaskRow[] = [];

  for (const task of tasks) {
    if (task.done_at !== null) {
      done.push(task);
    } else if (task.due_date < today) {
      overdue.push(task);
    } else {
      upcoming.push(task);
    }
  }

  const comparePending = (a: TaskRow, b: TaskRow): number => {
    const dueDiff = a.due_date.localeCompare(b.due_date);
    if (dueDiff !== 0) {
      return dueDiff;
    }
    return a.created_at.localeCompare(b.created_at);
  };

  overdue.sort(comparePending);
  upcoming.sort(comparePending);

  done.sort((a, b) => {
    const doneDiff = (b.done_at ?? '').localeCompare(a.done_at ?? '');
    if (doneDiff !== 0) {
      return doneDiff;
    }
    return b.created_at.localeCompare(a.created_at);
  });

  return { overdue, upcoming, done };
}

export function filterTasks(tasks: readonly TaskRow[], filter: TaskProfileFilter): TaskRow[] {
  if (filter === 'all') {
    return [...tasks];
  }
  if (filter === 'unassigned') {
    return tasks.filter((task) => task.assignee_profile_id === null);
  }
  return tasks.filter((task) => task.assignee_profile_id === filter);
}

export function taskDueLabel(dueDate: string, today: string): string {
  const [dueY, dueM, dueD] = dueDate.split('-').map(Number);
  const [todayY, todayM, todayD] = today.split('-').map(Number);

  const dueUtc = Date.UTC(dueY, dueM - 1, dueD);
  const todayUtc = Date.UTC(todayY, todayM - 1, todayD);
  const diffDays = Math.round((dueUtc - todayUtc) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) {
    return 'Vence hoy';
  }
  if (diffDays === 1) {
    return 'Vence mañana';
  }
  if (diffDays > 1) {
    return `Vence el ${formatDayMonth(dueDate)}`;
  }
  if (diffDays === -1) {
    return 'Venció ayer';
  }
  return `Venció hace ${Math.abs(diffDays)} días`;
}

export function taskDoneLabel(doneAt: string): string {
  return `Hecha el ${formatDayMonth(doneAt)}`;
}

export function tasksCardText(tasks: readonly TaskRow[], today: string): string {
  if (tasks.length === 0) {
    return 'Sin tareas';
  }

  const pending = tasks.filter((task) => task.done_at === null);
  if (pending.length === 0) {
    return 'Sin pendientes';
  }

  const pendingCount = pending.length;
  const overdueCount = pending.filter((task) => taskIsOverdue(task, today)).length;

  const pendingLabel = pendingCount === 1 ? '1 pendiente' : `${pendingCount} pendientes`;

  if (overdueCount === 0) {
    return pendingLabel;
  }

  const overdueLabel = overdueCount === 1 ? '1 vencida' : `${overdueCount} vencidas`;
  return `${pendingLabel}, ${overdueLabel}`;
}

export function shouldAskToRegisterPayment({
  isOwner,
  marking,
  link,
}: {
  isOwner: boolean;
  marking: boolean;
  link: TaskExpenseLink | null;
}): boolean {
  return isOwner && marking && link !== null && link.paid_cop < link.amount_cop;
}
