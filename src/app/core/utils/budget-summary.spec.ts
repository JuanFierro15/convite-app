import {
  budgetCardText,
  budgetSummary,
  byCategory,
  byProfile,
} from './budget-summary';
import {
  ExpenseCategoryRow,
  ExpenseWithPayments,
} from '../models/budget';
import { TeamProfileRow } from '../models/team-profiles';

describe('budget-summary utils', () => {
  const NBSP = String.fromCharCode(160);

  const mockExpenses: ExpenseWithPayments[] = [
    {
      id: 'exp-1',
      event_id: 'event-1',
      category_id: 'cat-1',
      task_id: null,
      description: 'Lugar del evento',
      amount_cop: 500000,
      note: null,
      created_at: '2026-11-01T10:00:00Z',
      updated_at: '2026-11-01T10:00:00Z',
      task: null,
      payments: [
        {
          id: 'pay-1',
          event_id: 'event-1',
          expense_id: 'exp-1',
          paid_by_profile_id: 'prof-1',
          amount_cop: 200000,
          paid_on: '2026-11-02',
          created_at: '2026-11-02T10:00:00Z',
        },
        {
          id: 'pay-2',
          event_id: 'event-1',
          expense_id: 'exp-1',
          paid_by_profile_id: 'prof-2',
          amount_cop: 100000,
          paid_on: '2026-11-03',
          created_at: '2026-11-03T10:00:00Z',
        },
      ],
    },
    {
      id: 'exp-2',
      event_id: 'event-1',
      category_id: 'cat-2',
      task_id: null,
      description: 'Torta temática',
      amount_cop: 300000,
      note: null,
      created_at: '2026-11-01T12:00:00Z',
      updated_at: '2026-11-01T12:00:00Z',
      task: null,
      payments: [
        {
          id: 'pay-3',
          event_id: 'event-1',
          expense_id: 'exp-2',
          paid_by_profile_id: 'prof-3-archived',
          amount_cop: 300000,
          paid_on: '2026-11-04',
          created_at: '2026-11-04T10:00:00Z',
        },
      ],
    },
  ];

  describe('budgetSummary', () => {
    it('calculates summary with budget defined', () => {
      const summary = budgetSummary(1000000, mockExpenses);

      expect(summary.budget).toBe(1000000);
      expect(summary.committed).toBe(800000);
      expect(summary.paid).toBe(600000);
      expect(summary.toPay).toBe(200000);
      expect(summary.available).toBe(200000);
      expect(summary.overBy).toBe(0);
    });

    it('calculates summary without budget (null)', () => {
      const summary = budgetSummary(null, mockExpenses);

      expect(summary.budget).toBeNull();
      expect(summary.committed).toBe(800000);
      expect(summary.paid).toBe(600000);
      expect(summary.toPay).toBe(200000);
      expect(summary.available).toBeNull();
      expect(summary.overBy).toBe(0);
    });

    it('calculates summary when budget is exceeded', () => {
      const summary = budgetSummary(500000, mockExpenses);

      expect(summary.budget).toBe(500000);
      expect(summary.committed).toBe(800000);
      expect(summary.paid).toBe(600000);
      expect(summary.toPay).toBe(200000);
      expect(summary.available).toBe(-300000);
      expect(summary.overBy).toBe(300000);
    });

    it('considers budget of 0 as a defined budget', () => {
      const summary = budgetSummary(0, mockExpenses);

      expect(summary.budget).toBe(0);
      expect(summary.committed).toBe(800000);
      expect(summary.paid).toBe(600000);
      expect(summary.toPay).toBe(200000);
      expect(summary.available).toBe(-800000);
      expect(summary.overBy).toBe(800000);
    });

    it('handles empty expenses list', () => {
      const summary = budgetSummary(500000, []);

      expect(summary.budget).toBe(500000);
      expect(summary.committed).toBe(0);
      expect(summary.paid).toBe(0);
      expect(summary.toPay).toBe(0);
      expect(summary.available).toBe(500000);
      expect(summary.overBy).toBe(0);
    });
  });

  describe('byCategory', () => {
    const categories: ExpenseCategoryRow[] = [
      { id: 'cat-1', event_id: 'event-1', name: 'Lugar', sort_order: 0, created_at: '' },
      { id: 'cat-2', event_id: 'event-1', name: 'Torta y postres', sort_order: 1, created_at: '' },
      { id: 'cat-3', event_id: 'event-1', name: 'Decoración', sort_order: 2, created_at: '' },
    ];

    it('omits categories without expenses and orders by committed descending', () => {
      const breakdown = byCategory(mockExpenses, categories);

      expect(breakdown).toHaveLength(2);
      expect(breakdown[0]).toEqual({
        category_id: 'cat-1',
        name: 'Lugar',
        committed: 500000,
        paid: 300000,
      });
      expect(breakdown[1]).toEqual({
        category_id: 'cat-2',
        name: 'Torta y postres',
        committed: 300000,
        paid: 300000,
      });
      expect(breakdown.some((b) => b.category_id === 'cat-3')).toBe(false);
    });

    it('breaks ties in committed by name with localeCompare in Spanish', () => {
      const tiedExpenses: ExpenseWithPayments[] = [
        {
          id: 'exp-a',
          event_id: 'event-1',
          category_id: 'cat-z',
          task_id: null,
          description: 'A',
          amount_cop: 200000,
          note: null,
          created_at: '',
          updated_at: '',
          task: null,
          payments: [],
        },
        {
          id: 'exp-b',
          event_id: 'event-1',
          category_id: 'cat-a',
          task_id: null,
          description: 'B',
          amount_cop: 200000,
          note: null,
          created_at: '',
          updated_at: '',
          task: null,
          payments: [],
        },
      ];

      const tiedCats: ExpenseCategoryRow[] = [
        { id: 'cat-z', event_id: 'event-1', name: 'Zapatos', sort_order: 0, created_at: '' },
        { id: 'cat-a', event_id: 'event-1', name: 'Alquiler', sort_order: 1, created_at: '' },
      ];

      const breakdown = byCategory(tiedExpenses, tiedCats);
      expect(breakdown.map((b) => b.name)).toEqual(['Alquiler', 'Zapatos']);
    });
  });

  describe('byProfile', () => {
    const profiles: TeamProfileRow[] = [
      { id: 'prof-1', team_id: 'team-1', name: 'Juan', sort_order: 0, archived_at: null, created_at: '' },
      { id: 'prof-2', team_id: 'team-1', name: 'Laura', sort_order: 1, archived_at: null, created_at: '' },
      {
        id: 'prof-3-archived',
        team_id: 'team-1',
        name: 'Tía Gloria',
        sort_order: 2,
        archived_at: '2026-11-01T00:00:00Z',
        created_at: '',
      },
      { id: 'prof-4-idle', team_id: 'team-1', name: 'Carlos', sort_order: 3, archived_at: null, created_at: '' },
    ];

    it('includes only profiles with payments, ordered by paid descending', () => {
      const breakdown = byProfile(mockExpenses, profiles);

      expect(breakdown).toHaveLength(3);
      expect(breakdown[0]).toEqual({
        profile_id: 'prof-3-archived',
        name: 'Tía Gloria',
        paid: 300000,
      });
      expect(breakdown[1]).toEqual({
        profile_id: 'prof-1',
        name: 'Juan',
        paid: 200000,
      });
      expect(breakdown[2]).toEqual({
        profile_id: 'prof-2',
        name: 'Laura',
        paid: 100000,
      });
      expect(breakdown.some((b) => b.profile_id === 'prof-4-idle')).toBe(false);
    });

    it('names missing profile as "Perfil no disponible"', () => {
      const expenseWithUnknownProfile: ExpenseWithPayments = {
        id: 'exp-unknown',
        event_id: 'event-1',
        category_id: 'cat-1',
        task_id: null,
        description: 'Varios',
        amount_cop: 50000,
        note: null,
        created_at: '',
        updated_at: '',
        task: null,
        payments: [
          {
            id: 'pay-orphan',
            event_id: 'event-1',
            expense_id: 'exp-unknown',
            paid_by_profile_id: 'prof-missing',
            amount_cop: 50000,
            paid_on: '2026-11-05',
            created_at: '',
          },
        ],
      };

      const breakdown = byProfile([expenseWithUnknownProfile], profiles);
      expect(breakdown).toEqual([
        {
          profile_id: 'prof-missing',
          name: 'Perfil no disponible',
          paid: 50000,
        },
      ]);
    });
  });

  describe('budgetCardText', () => {
    it('returns "Van $ X de $ Y" when budget is defined', () => {
      expect(budgetCardText(1000000, 800000)).toBe(`Van $${NBSP}800.000 de $${NBSP}1.000.000`);
    });

    it('returns "Van $ X de $ 0" when budget is 0', () => {
      expect(budgetCardText(0, 500000)).toBe(`Van $${NBSP}500.000 de $${NBSP}0`);
    });

    it('returns "Van $ X en gastos" when budget is null', () => {
      expect(budgetCardText(null, 800000)).toBe(`Van $${NBSP}800.000 en gastos`);
    });
  });
});
