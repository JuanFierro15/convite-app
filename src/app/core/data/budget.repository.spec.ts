import { TestBed } from '@angular/core/testing';
import { SupabaseService } from '../supabase/supabase.service';
import { BudgetRepository } from './budget.repository';
import { ExpenseCategoryRow, ExpenseInput, PaymentInput } from '../models/budget';
import { LOAD_ERROR_MESSAGE } from './errors';

describe('BudgetRepository', () => {
  let repository: BudgetRepository;
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

    repository = TestBed.inject(BudgetRepository);
  });

  describe('categories', () => {
    it('listCategories orders by sort_order and name', async () => {
      const mockOrderName = vi.fn().mockResolvedValue({
        data: [
          { id: 'cat-1', event_id: 'event-1', name: 'Lugar', sort_order: 0, created_at: '' },
          { id: 'cat-2', event_id: 'event-1', name: 'Torta', sort_order: 1, created_at: '' },
        ],
        error: null,
      });
      const mockOrderSort = vi.fn().mockReturnValue({ order: mockOrderName });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrderSort });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabase.client.from.mockReturnValue({ select: mockSelect });

      const result = await repository.listCategories('event-1');

      expect(mockSupabase.client.from).toHaveBeenCalledWith('expense_categories');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockEq).toHaveBeenCalledWith('event_id', 'event-1');
      expect(mockOrderSort).toHaveBeenCalledWith('sort_order', { ascending: true });
      expect(mockOrderName).toHaveBeenCalledWith('name', { ascending: true });
      expect(result).toHaveLength(2);
    });

    it('createCategory trims name and returns created row', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'cat-1', event_id: 'event-1', name: 'Decoración', sort_order: 1 },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      mockSupabase.client.from.mockReturnValue({ insert: mockInsert });

      const result = await repository.createCategory('event-1', '  Decoración  ', 1);

      expect(mockInsert).toHaveBeenCalledWith({
        event_id: 'event-1',
        name: 'Decoración',
        sort_order: 1,
      });
      expect(result.name).toBe('Decoración');
    });

    it('renameCategory trims name and updates row', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'cat-1', name: 'Bebidas' },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabase.client.from.mockReturnValue({ update: mockUpdate });

      const result = await repository.renameCategory('cat-1', '  Bebidas  ');

      expect(mockUpdate).toHaveBeenCalledWith({ name: 'Bebidas' });
      expect(mockEq).toHaveBeenCalledWith('id', 'cat-1');
      expect(result.name).toBe('Bebidas');
    });

    it('removeCategory deletes category by id', async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockDelete = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabase.client.from.mockReturnValue({ delete: mockDelete });

      await repository.removeCategory('cat-1');

      expect(mockDelete).toHaveBeenCalled();
      expect(mockEq).toHaveBeenCalledWith('id', 'cat-1');
    });

    it('swapCategoryOrder swaps sort_order values sequentially when different', async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabase.client.from.mockReturnValue({ update: mockUpdate });

      const catA: ExpenseCategoryRow = {
        id: 'cat-a',
        event_id: 'event-1',
        name: 'A',
        sort_order: 1,
        created_at: '',
      };
      const catB: ExpenseCategoryRow = {
        id: 'cat-b',
        event_id: 'event-1',
        name: 'B',
        sort_order: 5,
        created_at: '',
      };

      await repository.swapCategoryOrder(catA, catB);

      expect(mockUpdate).toHaveBeenNthCalledWith(1, { sort_order: 5 });
      expect(mockEq).toHaveBeenNthCalledWith(1, 'id', 'cat-a');
      expect(mockUpdate).toHaveBeenNthCalledWith(2, { sort_order: 1 });
      expect(mockEq).toHaveBeenNthCalledWith(2, 'id', 'cat-b');
    });

    it('swapCategoryOrder handles equal sort_order by assigning b.sort_order and a.sort_order + 1', async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabase.client.from.mockReturnValue({ update: mockUpdate });

      const catA: ExpenseCategoryRow = {
        id: 'cat-a',
        event_id: 'event-1',
        name: 'A',
        sort_order: 2,
        created_at: '',
      };
      const catB: ExpenseCategoryRow = {
        id: 'cat-b',
        event_id: 'event-1',
        name: 'B',
        sort_order: 2,
        created_at: '',
      };

      await repository.swapCategoryOrder(catA, catB);

      expect(mockUpdate).toHaveBeenNthCalledWith(1, { sort_order: 2 });
      expect(mockEq).toHaveBeenNthCalledWith(1, 'id', 'cat-a');
      expect(mockUpdate).toHaveBeenNthCalledWith(2, { sort_order: 3 });
      expect(mockEq).toHaveBeenNthCalledWith(2, 'id', 'cat-b');
    });

    it('addSuggestedCategories inserts missing suggested categories in order and follows max sort_order', async () => {
      const mockSelect = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [
            { name: 'lugar', sort_order: 3 },
            { name: 'Decoración', sort_order: 4 },
          ],
          error: null,
        }),
      };
      const mockInsert = vi.fn().mockResolvedValue({ error: null });

      mockSupabase.client.from.mockImplementation((table: string) => {
        if (table === 'expense_categories') {
          return {
            select: mockSelect.select,
            eq: mockSelect.eq,
            insert: mockInsert,
          };
        }
        return {};
      });

      const count = await repository.addSuggestedCategories('event-1');

      expect(count).toBe(5);
      expect(mockInsert).toHaveBeenCalledWith([
        { event_id: 'event-1', name: 'Comida y bebidas', sort_order: 5 },
        { event_id: 'event-1', name: 'Torta y postres', sort_order: 6 },
        { event_id: 'event-1', name: 'Recordatorios', sort_order: 7 },
        { event_id: 'event-1', name: 'Entretenimiento', sort_order: 8 },
        { event_id: 'event-1', name: 'Otros', sort_order: 9 },
      ]);
    });

    it('addSuggestedCategories returns 0 when all suggested categories already exist', async () => {
      const allCategories = [
        'lugar',
        'decoración',
        'comida y bebidas',
        'torta y postres',
        'recordatorios',
        'entretenimiento',
        'otros',
      ].map((name, i) => ({ name, sort_order: i }));

      const mockSelect = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: allCategories,
          error: null,
        }),
      };
      const mockInsert = vi.fn().mockResolvedValue({ error: null });

      mockSupabase.client.from.mockReturnValue({
        select: mockSelect.select,
        eq: mockSelect.eq,
        insert: mockInsert,
      });

      const count = await repository.addSuggestedCategories('event-1');

      expect(count).toBe(0);
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });

  describe('expenses', () => {
    it('listExpenses maps payments, sorts them by paid_on and created_at, strips raw keys and extracts task', async () => {
      const rawRows = [
        {
          id: 'exp-1',
          event_id: 'event-1',
          category_id: 'cat-1',
          task_id: 'task-1',
          description: 'Música y sonido',
          amount_cop: 600000,
          note: 'Incluye DJ',
          created_at: '2026-11-01T10:00:00Z',
          updated_at: '2026-11-01T10:00:00Z',
          expense_payments: [
            {
              id: 'pay-2',
              event_id: 'event-1',
              expense_id: 'exp-1',
              paid_by_profile_id: 'prof-1',
              amount_cop: 200000,
              paid_on: '2026-11-03',
              created_at: '2026-11-03T12:00:00Z',
            },
            {
              id: 'pay-1',
              event_id: 'event-1',
              expense_id: 'exp-1',
              paid_by_profile_id: 'prof-1',
              amount_cop: 100000,
              paid_on: '2026-11-02',
              created_at: '2026-11-02T10:00:00Z',
            },
          ],
          tasks: {
            id: 'task-1',
            title: 'Contratar DJ',
            done_at: '2026-11-04T08:00:00Z',
          },
        },
        {
          id: 'exp-2',
          event_id: 'event-1',
          category_id: 'cat-2',
          task_id: null,
          description: 'Centros de mesa',
          amount_cop: 150000,
          note: null,
          created_at: '2026-11-01T09:00:00Z',
          updated_at: '2026-11-01T09:00:00Z',
          expense_payments: [],
          tasks: null,
        },
      ];

      const mockOrder = vi.fn().mockResolvedValue({ data: rawRows, error: null });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabase.client.from.mockReturnValue({ select: mockSelect });

      const result = await repository.listExpenses('event-1');

      expect(mockSelect).toHaveBeenCalledWith(
        '*, expense_payments(*), tasks!expenses_task_same_event(id, title, done_at)',
      );
      expect(mockEq).toHaveBeenCalledWith('event_id', 'event-1');
      expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });

      expect(result).toHaveLength(2);

      const first = result[0];
      expect(first.id).toBe('exp-1');
      expect(first.task).toEqual({
        id: 'task-1',
        title: 'Contratar DJ',
        done_at: '2026-11-04T08:00:00Z',
      });
      expect(first.payments.map((p) => p.id)).toEqual(['pay-1', 'pay-2']);
      expect((first as unknown as Record<string, unknown>)['expense_payments']).toBeUndefined();
      expect((first as unknown as Record<string, unknown>)['tasks']).toBeUndefined();

      const second = result[1];
      expect(second.task).toBeNull();
      expect(second.payments).toEqual([]);
    });

    it('getExpense retrieves single expense with maybeSingle and maps it', async () => {
      const rawRow = {
        id: 'exp-1',
        event_id: 'event-1',
        category_id: 'cat-1',
        task_id: null,
        description: 'Torta',
        amount_cop: 250000,
        note: null,
        created_at: '2026-11-01T10:00:00Z',
        updated_at: '2026-11-01T10:00:00Z',
        expense_payments: [],
        tasks: null,
      };

      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: rawRow, error: null });
      const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabase.client.from.mockReturnValue({ select: mockSelect });

      const result = await repository.getExpense('exp-1');

      expect(mockMaybeSingle).toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result?.description).toBe('Torta');
      expect(result?.task).toBeNull();
    });

    it('getExpense returns null when maybeSingle yields no data', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabase.client.from.mockReturnValue({ select: mockSelect });

      const result = await repository.getExpense('non-existing');
      expect(result).toBeNull();
    });

    it('createExpense trims description and saves empty note as null', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'exp-1', description: 'Gasto nuevo', note: null },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      mockSupabase.client.from.mockReturnValue({ insert: mockInsert });

      const input: ExpenseInput = {
        category_id: 'cat-1',
        description: '  Gasto nuevo  ',
        amount_cop: 120000,
        note: '   ',
      };

      await repository.createExpense('event-1', input);

      expect(mockInsert).toHaveBeenCalledWith({
        event_id: 'event-1',
        category_id: 'cat-1',
        description: 'Gasto nuevo',
        amount_cop: 120000,
        note: null,
      });
    });

    it('updateExpense trims description and saves empty note as null', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'exp-1', description: 'Gasto editado', note: 'Nota válida' },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabase.client.from.mockReturnValue({ update: mockUpdate });

      const input: ExpenseInput = {
        category_id: 'cat-1',
        description: '  Gasto editado  ',
        amount_cop: 150000,
        note: '  Nota válida  ',
      };

      await repository.updateExpense('exp-1', input);

      expect(mockUpdate).toHaveBeenCalledWith({
        category_id: 'cat-1',
        description: 'Gasto editado',
        amount_cop: 150000,
        note: 'Nota válida',
      });
      expect(mockEq).toHaveBeenCalledWith('id', 'exp-1');
    });

    it('removeExpense deletes by id', async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockDelete = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabase.client.from.mockReturnValue({ delete: mockDelete });

      await repository.removeExpense('exp-1');

      expect(mockEq).toHaveBeenCalledWith('id', 'exp-1');
    });

    it('committedTotal sums amount_cop with select("amount_cop")', async () => {
      const mockEq = vi.fn().mockResolvedValue({
        data: [{ amount_cop: 100000 }, { amount_cop: 250000 }, { amount_cop: 50000 }],
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabase.client.from.mockReturnValue({ select: mockSelect });

      const total = await repository.committedTotal('event-1');

      expect(mockSelect).toHaveBeenCalledWith('amount_cop');
      expect(mockEq).toHaveBeenCalledWith('event_id', 'event-1');
      expect(total).toBe(400000);
    });

    it('committedTotal throws toUserError with LOAD_ERROR_MESSAGE on failure', async () => {
      const mockEq = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'query_failed' },
      });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabase.client.from.mockReturnValue({ select: mockSelect });

      await expect(repository.committedTotal('event-1')).rejects.toThrow(LOAD_ERROR_MESSAGE);
    });
  });

  describe('payments', () => {
    it('addPayment passes event_id and input fields', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'pay-1', amount_cop: 50000 },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      mockSupabase.client.from.mockReturnValue({ insert: mockInsert });

      const input: PaymentInput = {
        expense_id: 'exp-1',
        amount_cop: 50000,
        paid_on: '2026-11-05',
        paid_by_profile_id: 'prof-1',
      };

      await repository.addPayment('event-1', input);

      expect(mockInsert).toHaveBeenCalledWith({
        event_id: 'event-1',
        expense_id: 'exp-1',
        amount_cop: 50000,
        paid_on: '2026-11-05',
        paid_by_profile_id: 'prof-1',
      });
    });

    it('translates payment_exceeds_expense error on addPayment with toUserError', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'payment_exceeds_expense' },
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      mockSupabase.client.from.mockReturnValue({ insert: mockInsert });

      const input: PaymentInput = {
        expense_id: 'exp-1',
        amount_cop: 999999,
        paid_on: '2026-11-05',
        paid_by_profile_id: 'prof-1',
      };

      await expect(repository.addPayment('event-1', input)).rejects.toThrow(
        'El pago supera lo que falta por pagar.',
      );
    });

    it('removePayment deletes payment by id', async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockDelete = vi.fn().mockReturnValue({ eq: mockEq });
      mockSupabase.client.from.mockReturnValue({ delete: mockDelete });

      await repository.removePayment('pay-1');

      expect(mockEq).toHaveBeenCalledWith('id', 'pay-1');
    });
  });

  describe('tasks integration', () => {
    describe('linksForTasks', () => {
      it('selects expenses with non-null task_id and calculates paid_cop with paidTotal', async () => {
        const mockRows = [
          {
            id: 'exp-1',
            task_id: 'task-1',
            description: 'Torta de chocolate',
            amount_cop: 120000,
            expense_payments: [{ amount_cop: 50000 }, { amount_cop: 30000 }],
          },
          {
            id: 'exp-2',
            task_id: 'task-2',
            description: 'Decoración globos',
            amount_cop: 80000,
            expense_payments: [],
          },
        ];

        const mockNot = vi.fn().mockResolvedValue({ data: mockRows, error: null });
        const mockEq = vi.fn().mockReturnValue({ not: mockNot });
        const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
        mockSupabase.client.from.mockReturnValue({ select: mockSelect });

        const result = await repository.linksForTasks('event-1');

        expect(mockSupabase.client.from).toHaveBeenCalledWith('expenses');
        expect(mockSelect).toHaveBeenCalledWith(
          'id, task_id, description, amount_cop, expense_payments(amount_cop)',
        );
        expect(mockEq).toHaveBeenCalledWith('event_id', 'event-1');
        expect(mockNot).toHaveBeenCalledWith('task_id', 'is', null);

        expect(result).toEqual([
          {
            task_id: 'task-1',
            expense_id: 'exp-1',
            description: 'Torta de chocolate',
            amount_cop: 120000,
            paid_cop: 80000,
          },
          {
            task_id: 'task-2',
            expense_id: 'exp-2',
            description: 'Decoración globos',
            amount_cop: 80000,
            paid_cop: 0,
          },
        ]);
      });

      it('translates error with LOAD_ERROR_MESSAGE on linksForTasks failure', async () => {
        const mockNot = vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'db_error' },
        });
        const mockEq = vi.fn().mockReturnValue({ not: mockNot });
        const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
        mockSupabase.client.from.mockReturnValue({ select: mockSelect });

        await expect(repository.linksForTasks('event-1')).rejects.toThrow(LOAD_ERROR_MESSAGE);
      });
    });

    describe('freeExpenses', () => {
      it('selects expenses with null task_id', async () => {
        const mockRows = [
          {
            id: 'exp-free-1',
            description: 'Manteles',
            amount_cop: 60000,
          },
          {
            id: 'exp-free-2',
            description: 'Vasos y platos',
            amount_cop: 40000,
          },
        ];

        const mockIs = vi.fn().mockResolvedValue({ data: mockRows, error: null });
        const mockEq = vi.fn().mockReturnValue({ is: mockIs });
        const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
        mockSupabase.client.from.mockReturnValue({ select: mockSelect });

        const result = await repository.freeExpenses('event-1');

        expect(mockSupabase.client.from).toHaveBeenCalledWith('expenses');
        expect(mockSelect).toHaveBeenCalledWith('id, description, amount_cop');
        expect(mockEq).toHaveBeenCalledWith('event_id', 'event-1');
        expect(mockIs).toHaveBeenCalledWith('task_id', null);

        expect(result).toEqual([
          {
            id: 'exp-free-1',
            description: 'Manteles',
            amount_cop: 60000,
          },
          {
            id: 'exp-free-2',
            description: 'Vasos y platos',
            amount_cop: 40000,
          },
        ]);
      });

      it('translates error with LOAD_ERROR_MESSAGE on freeExpenses failure', async () => {
        const mockIs = vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'db_error' },
        });
        const mockEq = vi.fn().mockReturnValue({ is: mockIs });
        const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
        mockSupabase.client.from.mockReturnValue({ select: mockSelect });

        await expect(repository.freeExpenses('event-1')).rejects.toThrow(LOAD_ERROR_MESSAGE);
      });
    });
  });
});
