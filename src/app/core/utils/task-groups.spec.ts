import { TaskRow } from '../models/tasks';
import { toBogotaDateInput } from './dates';
import {
  filterTasks,
  groupTasks,
  shouldAskToRegisterPayment,
  taskDoneLabel,
  taskDueLabel,
  taskIsOverdue,
  tasksCardText,
} from './task-groups';

function makeTask(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 'task-1',
    event_id: 'event-1',
    title: 'Comprar pastel',
    note: null,
    assignee_profile_id: null,
    due_date: '2026-11-20',
    done_at: null,
    done_by: null,
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-01T10:00:00Z',
    ...overrides,
  };
}

describe('task-groups', () => {
  describe('groupTasks', () => {
    it('separates tasks into overdue, upcoming, and done, sorting each group correctly', () => {
      const today = '2026-11-20';

      const taskDoneOld = makeTask({
        id: 'done-1',
        title: 'Hecha antigua',
        done_at: '2026-11-10T10:00:00Z',
        created_at: '2026-11-01T08:00:00Z',
      });
      const taskDoneRecent = makeTask({
        id: 'done-2',
        title: 'Hecha reciente',
        done_at: '2026-11-15T12:00:00Z',
        created_at: '2026-11-02T08:00:00Z',
      });

      const taskOverdue1 = makeTask({
        id: 'overdue-1',
        title: 'Vencida ayer tarde',
        due_date: '2026-11-19',
        created_at: '2026-11-05T12:00:00Z',
      });
      const taskOverdue2 = makeTask({
        id: 'overdue-2',
        title: 'Vencida ayer temprano',
        due_date: '2026-11-19',
        created_at: '2026-11-05T08:00:00Z',
      });
      const taskOverdue3 = makeTask({
        id: 'overdue-3',
        title: 'Vencida anteayer',
        due_date: '2026-11-18',
        created_at: '2026-11-03T10:00:00Z',
      });

      const taskUpcomingToday = makeTask({
        id: 'upcoming-today',
        title: 'Para hoy',
        due_date: '2026-11-20',
        created_at: '2026-11-04T10:00:00Z',
      });
      const taskUpcomingLater1 = makeTask({
        id: 'upcoming-later-1',
        title: 'Para el 22 temprano',
        due_date: '2026-11-22',
        created_at: '2026-11-06T08:00:00Z',
      });
      const taskUpcomingLater2 = makeTask({
        id: 'upcoming-later-2',
        title: 'Para el 22 tarde',
        due_date: '2026-11-22',
        created_at: '2026-11-06T15:00:00Z',
      });

      const all = [
        taskDoneOld,
        taskUpcomingLater2,
        taskOverdue1,
        taskDoneRecent,
        taskUpcomingToday,
        taskOverdue3,
        taskOverdue2,
        taskUpcomingLater1,
      ];

      const groups = groupTasks(all, today);

      // Overdue: due_date ascendente, luego created_at ascendente
      expect(groups.overdue.map((t) => t.id)).toEqual(['overdue-3', 'overdue-2', 'overdue-1']);

      // Upcoming: due_date ascendente, luego created_at ascendente
      expect(groups.upcoming.map((t) => t.id)).toEqual([
        'upcoming-today',
        'upcoming-later-1',
        'upcoming-later-2',
      ]);

      // Done: done_at descendente
      expect(groups.done.map((t) => t.id)).toEqual(['done-2', 'done-1']);
    });
  });

  describe('cambio de día en Bogotá', () => {
    it('identifica correctamente el paso de medianoche en Bogotá', () => {
      const dateBefore = new Date('2026-11-21T04:59:00Z'); // 23:59 del 20 en Bogotá
      const dateAfter = new Date('2026-11-21T05:01:00Z'); // 00:01 del 21 en Bogotá

      const todayBefore = toBogotaDateInput(dateBefore);
      const todayAfter = toBogotaDateInput(dateAfter);

      expect(todayBefore).toBe('2026-11-20');
      expect(todayAfter).toBe('2026-11-21');

      const task = makeTask({ due_date: '2026-11-20' });

      // En el primer instante: vence hoy, no está vencida
      expect(taskIsOverdue(task, todayBefore)).toBe(false);
      expect(taskDueLabel(task.due_date, todayBefore)).toBe('Vence hoy');

      // Dos minutos después, ya es el día siguiente en Bogotá: venció ayer, está vencida
      expect(taskIsOverdue(task, todayAfter)).toBe(true);
      expect(taskDueLabel(task.due_date, todayAfter)).toBe('Venció ayer');
    });
  });

  describe('taskDueLabel', () => {
    it('handles all relative day differences', () => {
      const today = '2026-11-20';

      expect(taskDueLabel('2026-11-20', today)).toBe('Vence hoy');
      expect(taskDueLabel('2026-11-21', today)).toBe('Vence mañana');
      expect(taskDueLabel('2026-11-22', today)).toBe('Vence el 22 de noviembre');
      expect(taskDueLabel('2026-11-30', today)).toBe('Vence el 30 de noviembre');
      expect(taskDueLabel('2026-11-19', today)).toBe('Venció ayer');
      expect(taskDueLabel('2026-11-18', today)).toBe('Venció hace 2 días');
      expect(taskDueLabel('2026-11-15', today)).toBe('Venció hace 5 días');
    });

    it('handles month crossings accurately', () => {
      // Cruzando fin de octubre a inicio de noviembre
      expect(taskDueLabel('2026-11-01', '2026-10-31')).toBe('Vence mañana');
      expect(taskDueLabel('2026-10-31', '2026-11-01')).toBe('Venció ayer');
      expect(taskDueLabel('2026-11-02', '2026-10-31')).toBe('Vence el 2 de noviembre');
      expect(taskDueLabel('2026-10-30', '2026-11-01')).toBe('Venció hace 2 días');
    });

    it('handles year crossings accurately', () => {
      // Cruzando año nuevo
      expect(taskDueLabel('2027-01-01', '2026-12-31')).toBe('Vence mañana');
      expect(taskDueLabel('2026-12-31', '2027-01-01')).toBe('Venció ayer');
      expect(taskDueLabel('2027-01-02', '2026-12-31')).toBe('Vence el 2 de enero');
      expect(taskDueLabel('2026-12-30', '2027-01-01')).toBe('Venció hace 2 días');
    });
  });

  describe('taskDoneLabel', () => {
    it('formats done_at with formatDayMonth', () => {
      expect(taskDoneLabel('2026-11-03T15:00:00-05:00')).toBe('Hecha el 3 de noviembre');
      expect(taskDoneLabel('2026-11-20')).toBe('Hecha el 20 de noviembre');
    });
  });

  describe('tasksCardText', () => {
    const today = '2026-11-20';

    it('returns "Sin tareas" when there are no tasks', () => {
      expect(tasksCardText([], today)).toBe('Sin tareas');
    });

    it('returns "Sin pendientes" when all tasks are done', () => {
      const tasks = [
        makeTask({ id: '1', done_at: '2026-11-18T10:00:00Z' }),
        makeTask({ id: '2', done_at: '2026-11-19T10:00:00Z' }),
      ];
      expect(tasksCardText(tasks, today)).toBe('Sin pendientes');
    });

    it('returns singular or plural pending text when there are no overdue tasks', () => {
      const onePending = [
        makeTask({ id: '1', due_date: '2026-11-20', done_at: null }),
        makeTask({ id: '2', done_at: '2026-11-19T10:00:00Z' }),
      ];
      expect(tasksCardText(onePending, today)).toBe('1 pendiente');

      const fourPending = [
        makeTask({ id: '1', due_date: '2026-11-20' }),
        makeTask({ id: '2', due_date: '2026-11-21' }),
        makeTask({ id: '3', due_date: '2026-11-22' }),
        makeTask({ id: '4', due_date: '2026-11-23' }),
      ];
      expect(tasksCardText(fourPending, today)).toBe('4 pendientes');
    });

    it('returns combined pending and overdue text with proper singular/plural forms', () => {
      // 1 pendiente, 1 vencida
      const oneOverdueOnePending = [
        makeTask({ id: '1', due_date: '2026-11-19' }), // vencida
      ];
      expect(tasksCardText(oneOverdueOnePending, today)).toBe('1 pendiente, 1 vencida');

      // 4 pendientes, 1 vencida
      const fourPendingOneOverdue = [
        makeTask({ id: '1', due_date: '2026-11-19' }), // vencida
        makeTask({ id: '2', due_date: '2026-11-20' }),
        makeTask({ id: '3', due_date: '2026-11-21' }),
        makeTask({ id: '4', due_date: '2026-11-22' }),
      ];
      expect(tasksCardText(fourPendingOneOverdue, today)).toBe('4 pendientes, 1 vencida');

      // 4 pendientes, 2 vencidas
      const fourPendingTwoOverdue = [
        makeTask({ id: '1', due_date: '2026-11-18' }), // vencida
        makeTask({ id: '2', due_date: '2026-11-19' }), // vencida
        makeTask({ id: '3', due_date: '2026-11-20' }),
        makeTask({ id: '4', due_date: '2026-11-21' }),
      ];
      expect(tasksCardText(fourPendingTwoOverdue, today)).toBe('4 pendientes, 2 vencidas');
    });
  });

  describe('filterTasks', () => {
    const taskUnassigned = makeTask({ id: '1', assignee_profile_id: null });
    const taskProfileA1 = makeTask({ id: '2', assignee_profile_id: 'prof-a' });
    const taskProfileA2 = makeTask({ id: '3', assignee_profile_id: 'prof-a' });
    const taskProfileB = makeTask({ id: '4', assignee_profile_id: 'prof-b' });

    const allTasks = [taskUnassigned, taskProfileA1, taskProfileA2, taskProfileB];

    it('returns all tasks when filter is "all"', () => {
      const result = filterTasks(allTasks, 'all');
      expect(result).toHaveLength(4);
      expect(result.map((t) => t.id)).toEqual(['1', '2', '3', '4']);
    });

    it('returns only unassigned tasks when filter is "unassigned"', () => {
      const result = filterTasks(allTasks, 'unassigned');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('returns only tasks matching specific profile id', () => {
      const resultA = filterTasks(allTasks, 'prof-a');
      expect(resultA.map((t) => t.id)).toEqual(['2', '3']);

      const resultB = filterTasks(allTasks, 'prof-b');
      expect(resultB.map((t) => t.id)).toEqual(['4']);

      const resultUnknown = filterTasks(allTasks, 'prof-c');
      expect(resultUnknown).toHaveLength(0);
    });
  });

  describe('shouldAskToRegisterPayment', () => {
    const linkWithBalance = {
      task_id: 'task-1',
      expense_id: 'exp-1',
      description: 'Torta',
      amount_cop: 100000,
      paid_cop: 40000,
    };

    const linkFullyPaid = {
      task_id: 'task-1',
      expense_id: 'exp-1',
      description: 'Torta',
      amount_cop: 100000,
      paid_cop: 100000,
    };

    it('returns true when owner marks done a task with an expense that has remaining balance', () => {
      expect(
        shouldAskToRegisterPayment({
          isOwner: true,
          marking: true,
          link: linkWithBalance,
        }),
      ).toBe(true);
    });

    it('returns false for helpers', () => {
      expect(
        shouldAskToRegisterPayment({
          isOwner: false,
          marking: true,
          link: linkWithBalance,
        }),
      ).toBe(false);
    });

    it('returns false when unmarking a task', () => {
      expect(
        shouldAskToRegisterPayment({
          isOwner: true,
          marking: false,
          link: linkWithBalance,
        }),
      ).toBe(false);
    });

    it('returns false when task has no linked expense', () => {
      expect(
        shouldAskToRegisterPayment({
          isOwner: true,
          marking: true,
          link: null,
        }),
      ).toBe(false);
    });

    it('returns false when expense is already fully paid', () => {
      expect(
        shouldAskToRegisterPayment({
          isOwner: true,
          marking: true,
          link: linkFullyPaid,
        }),
      ).toBe(false);
    });
  });
});
