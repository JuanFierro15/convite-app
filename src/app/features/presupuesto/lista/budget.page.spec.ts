import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import {
  AlertController,
  ModalController,
  ToastController,
} from '@ionic/angular';
import {
  BudgetRepository,
  EventContextService,
  EventRole,
  EventRow,
  ExpenseCategoryRow,
  ExpenseWithPayments,
  RealtimeService,
  TeamProfileRow,
  TeamProfilesRepository,
  formatCop,
} from '../../../core';
import { BudgetPage, showsTaskDoneMark } from './budget.page';

describe('BudgetPage', () => {
  beforeAll(() => {
    if (!Element.prototype.scrollTo) {
      Element.prototype.scrollTo = vi.fn();
    }
  });

  let fixture: ComponentFixture<BudgetPage>;
  let component: BudgetPage;
  let mockEventContext: {
    event: ReturnType<typeof signal<EventRow | null>>;
    role: ReturnType<typeof signal<EventRole | null>>;
    isOwner: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    loading: ReturnType<typeof signal<boolean>>;
    load: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
  let mockBudgetRepo: {
    listExpenses: ReturnType<typeof vi.fn>;
    listCategories: ReturnType<typeof vi.fn>;
  };
  let mockTeamProfilesRepo: {
    list: ReturnType<typeof vi.fn>;
    canManage: ReturnType<typeof vi.fn>;
  };
  let mockModalCtrl: {
    create: ReturnType<typeof vi.fn>;
  };
  let mockAlertCtrl: {
    create: ReturnType<typeof vi.fn>;
  };
  let mockToastCtrl: {
    create: ReturnType<typeof vi.fn>;
  };
  let mockRealtime: {
    watch: ReturnType<typeof vi.fn>;
  };
  let router: Router;

  const mockCategories: ExpenseCategoryRow[] = [
    {
      id: 'cat-1',
      event_id: 'evt-1',
      name: 'Comida y bebidas',
      sort_order: 1,
      created_at: '2026-10-01T00:00:00Z',
    },
    {
      id: 'cat-2',
      event_id: 'evt-1',
      name: 'Decoración',
      sort_order: 2,
      created_at: '2026-10-01T00:00:00Z',
    },
  ];

  const mockProfiles: TeamProfileRow[] = [
    {
      id: 'prof-1',
      team_id: 'team-1',
      name: 'Juan',
      sort_order: 1,
      archived_at: null,
      created_at: '2026-10-01T00:00:00Z',
    },
  ];

  const mockExpenses: ExpenseWithPayments[] = [
    {
      id: 'exp-1',
      event_id: 'evt-1',
      category_id: 'cat-1',
      description: 'Pasabocas',
      amount_cop: 200000,
      note: null,
      task_id: null,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
      payments: [
        {
          id: 'pay-1',
          event_id: 'evt-1',
          expense_id: 'exp-1',
          amount_cop: 200000,
          paid_on: '2026-10-15',
          paid_by_profile_id: 'prof-1',
          created_at: '2026-10-15T10:00:00Z',
        },
      ],
      task: null,
    },
    {
      id: 'exp-2',
      event_id: 'evt-1',
      category_id: 'cat-2',
      description: 'Globos y flores',
      amount_cop: 300000,
      note: null,
      task_id: null,
      created_at: '2026-10-02T00:00:00Z',
      updated_at: '2026-10-02T00:00:00Z',
      payments: [
        {
          id: 'pay-2',
          event_id: 'evt-1',
          expense_id: 'exp-2',
          amount_cop: 100000,
          paid_on: '2026-10-16',
          paid_by_profile_id: 'prof-1',
          created_at: '2026-10-16T10:00:00Z',
        },
      ],
      task: null,
    },
    {
      id: 'exp-3',
      event_id: 'evt-1',
      category_id: 'cat-1',
      description: 'Torta',
      amount_cop: 150000,
      note: null,
      task_id: null,
      created_at: '2026-10-03T00:00:00Z',
      updated_at: '2026-10-03T00:00:00Z',
      payments: [],
      task: null,
    },
  ];

  beforeEach(async () => {
    mockEventContext = {
      event: signal<EventRow | null>({
        id: 'evt-1',
        name: 'Baby Shower',
        starts_at: '2026-11-29T15:00:00-05:00',
        theme_id: 'baby-shower',
        team_id: 'team-1',
        budget_cop: 1000000,
        venue_name: null,
        venue_address: null,
        city: 'Neiva',
        map_url: null,
        welcome_message: null,
        rsvp_deadline: '2026-11-20',
        created_by: 'user-1',
        created_at: '2026-10-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
      }),
      role: signal<EventRole | null>('owner'),
      isOwner: signal<boolean>(true),
      error: signal<string | null>(null),
      loading: signal<boolean>(false),
      load: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn(),
    };

    mockBudgetRepo = {
      listExpenses: vi.fn().mockResolvedValue(mockExpenses),
      listCategories: vi.fn().mockResolvedValue(mockCategories),
    };

    mockTeamProfilesRepo = {
      list: vi.fn().mockResolvedValue(mockProfiles),
      canManage: vi.fn().mockResolvedValue(true),
    };

    mockModalCtrl = {
      create: vi.fn(),
    };

    mockAlertCtrl = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
      }),
    };

    mockToastCtrl = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
      }),
    };

    mockRealtime = {
      watch: vi.fn().mockReturnValue(vi.fn()),
    };

    await TestBed.configureTestingModule({
      imports: [BudgetPage],
      providers: [
        provideRouter([]),
        { provide: EventContextService, useValue: mockEventContext },
        { provide: BudgetRepository, useValue: mockBudgetRepo },
        { provide: TeamProfilesRepository, useValue: mockTeamProfilesRepo },
        { provide: RealtimeService, useValue: mockRealtime },
        { provide: ModalController, useValue: mockModalCtrl },
        { provide: AlertController, useValue: mockAlertCtrl },
        { provide: ToastController, useValue: mockToastCtrl },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(BudgetPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('id', 'evt-1');
  });

  it('con datos: carga y calcula resumen, categorías, perfiles y lista de gastos', async () => {
    await component.ionViewWillEnter();
    fixture.detectChanges();

    const sum = component.summary();
    expect(sum.budget).toBe(1000000);
    expect(sum.committed).toBe(650000); // 200k + 300k + 150k
    expect(sum.paid).toBe(300000); // 200k + 100k
    expect(sum.toPay).toBe(350000);
    expect(sum.available).toBe(350000);
    expect(sum.overBy).toBe(0);

    expect(component.categoryBreakdown().length).toBe(2);
    expect(component.profileBreakdown().length).toBe(1);
    expect(component.pagedExpenses().items.length).toBe(3);

    // Revisa que la sección por categoría esté visible
    const catSection = fixture.debugElement.query(By.css('.breakdown-section'));
    expect(catSection).not.toBeNull();
  });

  it('vacío: cuando no hay gastos oculta por categoría y muestra estado vacío', async () => {
    mockBudgetRepo.listExpenses.mockResolvedValue([]);

    await component.ionViewWillEnter();
    fixture.detectChanges();

    expect(component.expenses().length).toBe(0);

    // Por categoría se oculta si no hay gastos
    const categoryHeadings = fixture.debugElement.queryAll(By.css('#category-breakdown-heading'));
    expect(categoryHeadings.length).toBe(0);

    // Quién ha pagado muestra texto vacío
    const noPayments = fixture.debugElement.query(By.css('.no-payments'));
    expect(noPayments).not.toBeNull();
    expect(noPayments.nativeElement.textContent).toContain('Todavía no hay pagos registrados.');

    // Estado vacío en la lista de gastos
    const emptyState = fixture.debugElement.query(By.css('app-empty-state'));
    expect(emptyState).not.toBeNull();
    expect(emptyState.nativeElement.textContent).toContain(
      'Todavía no hay gastos. Agrega el primero para empezar a llevar las cuentas.',
    );
  });

  it('sin presupuesto: no muestra disponible y muestra aviso para definirlo', async () => {
    mockEventContext.event.set({
      ...mockEventContext.event()!,
      budget_cop: null,
    });

    await component.ionViewWillEnter();
    fixture.detectChanges();

    expect(component.summary().budget).toBeNull();
    expect(component.summary().available).toBeNull();

    const banner = fixture.debugElement.query(By.css('.no-budget-banner'));
    expect(banner).not.toBeNull();
    expect(banner.nativeElement.textContent).toContain(
      'Este evento no tiene presupuesto. Defínelo para ver cuánto te queda disponible.',
    );

    const defineBtn = fixture.debugElement.query(By.css('.define-budget-btn'));
    expect(defineBtn).not.toBeNull();
    expect(defineBtn.nativeElement.textContent).toContain('Definir presupuesto');
  });

  it('excedido: cuando se supera el presupuesto muestra "Te pasaste por $ X"', async () => {
    mockEventContext.event.set({
      ...mockEventContext.event()!,
      budget_cop: 500000, // Menor que los 650.000 comprometidos
    });

    await component.ionViewWillEnter();
    fixture.detectChanges();

    expect(component.summary().overBy).toBe(150000);

    const overBudgetEl = fixture.debugElement.query(By.css('.over-budget-text'));
    expect(overBudgetEl).not.toBeNull();
    expect(overBudgetEl.nativeElement.textContent).toContain(`Te pasaste por ${formatCop(150000)}`);
  });

  it('filtro Por pagar muestra solo gastos pendientes y abonados', async () => {
    await component.ionViewWillEnter();

    component.onFilterChange(new CustomEvent('ionChange', { detail: { value: 'to_pay' } }));
    fixture.detectChanges();

    expect(component.filter()).toBe('to_pay');
    expect(component.currentPage()).toBe(1);

    // exp-2 (abonado) y exp-3 (pendiente), exp-1 está pagado
    const filtered = component.filteredExpenses();
    expect(filtered.length).toBe(2);
    expect(filtered.map((e) => e.id)).toEqual(['exp-2', 'exp-3']);
  });

  it('paginación de 6: divide la lista y permite navegar entre páginas', async () => {
    const manyExpenses: ExpenseWithPayments[] = [];
    for (let i = 1; i <= 15; i++) {
      manyExpenses.push({
        id: `exp-${i}`,
        event_id: 'evt-1',
        category_id: 'cat-1',
        description: `Gasto número ${i}`,
        amount_cop: 10000 * i,
        note: null,
        task_id: null,
        created_at: `2026-10-01T${String(i).padStart(2, '0')}:00:00Z`,
        updated_at: `2026-10-01T${String(i).padStart(2, '0')}:00:00Z`,
        payments: [],
        task: null,
      });
    }
    mockBudgetRepo.listExpenses.mockResolvedValue(manyExpenses);

    await component.ionViewWillEnter();
    fixture.detectChanges();

    expect(component.pagedExpenses().totalPages).toBe(3);
    expect(component.pagedExpenses().items.length).toBe(6);
    expect(component.pagedExpenses().page).toBe(1);

    component.goToNextPage();
    expect(component.currentPage()).toBe(2);
    expect(component.pagedExpenses().items.length).toBe(6);

    component.goToNextPage();
    expect(component.currentPage()).toBe(3);
    expect(component.pagedExpenses().items.length).toBe(3);

    component.goToPreviousPage();
    expect(component.currentPage()).toBe(2);
    expect(component.pagedExpenses().items.length).toBe(6);
  });

  it('con 7 gastos aparece "Página 1 de 2" y 6 cards', async () => {
    const sevenExpenses: ExpenseWithPayments[] = Array.from({ length: 7 }, (_, i) => ({
      id: `exp-${i + 1}`,
      event_id: 'evt-1',
      category_id: 'cat-1',
      description: `Gasto ${i + 1}`,
      amount_cop: 50000,
      note: null,
      task_id: null,
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
      payments: [],
      task: null,
    }));
    mockBudgetRepo.listExpenses.mockResolvedValue(sevenExpenses);

    await component.ionViewWillEnter();
    fixture.detectChanges();

    const statusEl = fixture.debugElement.query(By.css('.pagination__status'));
    expect(statusEl).not.toBeNull();
    expect(statusEl.nativeElement.textContent.trim()).toBe('Página 1 de 2');

    const cards = fixture.debugElement.queryAll(By.css('.expense-card'));
    expect(cards.length).toBe(6);
  });

  it('"Nuevo gasto" sin categorías no abre la hoja y muestra alerta', async () => {
    mockBudgetRepo.listCategories.mockResolvedValue([]);

    await component.ionViewWillEnter();
    await component.openCreateExpense();

    expect(mockAlertCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        header: 'Primero crea una categoría.',
      }),
    );
    expect(mockModalCtrl.create).not.toHaveBeenCalled();
  });

  it('ayudante redirigido sin llamar a BudgetRepository', async () => {
    mockEventContext.role.set('helper');
    mockEventContext.isOwner.set(false);

    await component.ionViewWillEnter();

    expect(router.navigate).toHaveBeenCalledWith(['/eventos', 'evt-1', 'panel'], {
      replaceUrl: true,
    });
    expect(mockBudgetRepo.listExpenses).not.toHaveBeenCalled();
  });

  it('error al cargar muestra app-empty-state con botón Reintentar', async () => {
    mockBudgetRepo.listExpenses.mockRejectedValue(new Error('Falla de red'));

    await component.ionViewWillEnter();
    fixture.detectChanges();

    expect(component.error()).toBe('Falla de red');

    const emptyState = fixture.debugElement.query(By.css('app-empty-state'));
    expect(emptyState).not.toBeNull();
    expect(emptyState.nativeElement.textContent).toContain('Falla de red');

    // Al reintentar
    mockBudgetRepo.listExpenses.mockResolvedValue(mockExpenses);
    component.retryLoad();
    await fixture.whenStable();

    expect(mockBudgetRepo.listExpenses).toHaveBeenCalledTimes(2);
  });

  describe('showsTaskDoneMark', () => {
    function createExpense(overrides: Partial<ExpenseWithPayments> = {}): ExpenseWithPayments {
      return {
        id: 'exp-test',
        event_id: 'evt-1',
        category_id: 'cat-1',
        description: 'Gasto de prueba',
        amount_cop: 200000,
        note: null,
        task_id: 'task-test',
        created_at: '2026-10-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
        payments: [],
        task: {
          id: 'task-test',
          title: 'Tarea vinculada',
          done_at: '2026-11-01T10:00:00Z',
        },
        ...overrides,
      };
    }

    it('devuelve true si la tarea está hecha y el gasto está abonado', () => {
      const expense = createExpense({
        amount_cop: 200000,
        payments: [
          {
            id: 'pay-1',
            event_id: 'evt-1',
            expense_id: 'exp-test',
            amount_cop: 100000,
            paid_on: '2026-10-15',
            paid_by_profile_id: 'prof-1',
            created_at: '2026-10-15T10:00:00Z',
          },
        ],
      });
      expect(showsTaskDoneMark(expense)).toBe(true);
    });

    it('devuelve true si la tarea está hecha y el gasto está pendiente', () => {
      const expense = createExpense({
        amount_cop: 200000,
        payments: [],
      });
      expect(showsTaskDoneMark(expense)).toBe(true);
    });

    it('devuelve false si la tarea está hecha pero el gasto está pagado', () => {
      const expense = createExpense({
        amount_cop: 200000,
        payments: [
          {
            id: 'pay-1',
            event_id: 'evt-1',
            expense_id: 'exp-test',
            amount_cop: 200000,
            paid_on: '2026-10-15',
            paid_by_profile_id: 'prof-1',
            created_at: '2026-10-15T10:00:00Z',
          },
        ],
      });
      expect(showsTaskDoneMark(expense)).toBe(false);
    });

    it('devuelve false si la tarea no está hecha (done_at es null)', () => {
      const expense = createExpense({
        task: {
          id: 'task-test',
          title: 'Tarea no hecha',
          done_at: null,
        },
      });
      expect(showsTaskDoneMark(expense)).toBe(false);
    });

    it('devuelve false si no tiene tarea (task es null)', () => {
      const expense = createExpense({
        task: null,
        task_id: null,
      });
      expect(showsTaskDoneMark(expense)).toBe(false);
    });
  });

  it('pinta la marca "Tarea hecha" con badge-soft-secondary junto a la insignia de estado', async () => {
    const expenseWithDoneTask: ExpenseWithPayments = {
      id: 'exp-done',
      event_id: 'evt-1',
      category_id: 'cat-1',
      description: 'Gasto con tarea hecha',
      amount_cop: 300000,
      note: null,
      task_id: 't-1',
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
      payments: [
        {
          id: 'pay-done',
          event_id: 'evt-1',
          expense_id: 'exp-done',
          amount_cop: 100000,
          paid_on: '2026-10-15',
          paid_by_profile_id: 'prof-1',
          created_at: '2026-10-15T10:00:00Z',
        },
      ],
      task: {
        id: 't-1',
        title: 'Tarea hecha',
        done_at: '2026-11-01T10:00:00Z',
      },
    };
    mockBudgetRepo.listExpenses.mockResolvedValue([expenseWithDoneTask]);

    await component.ionViewWillEnter();
    fixture.detectChanges();

    const badgesContainer = fixture.debugElement.query(By.css('.expense-card__badges'));
    expect(badgesContainer).not.toBeNull();

    const taskDoneBadge = badgesContainer.query(By.css('.badge-soft-secondary'));
    expect(taskDoneBadge).not.toBeNull();
    expect(taskDoneBadge.nativeElement.textContent?.trim()).toBe('Tarea hecha');
  });

  it('se suscribe a realtime únicamente con [tasks] y sin tablas de dinero, y se detiene en ionViewWillLeave', async () => {
    const unsubscribeSpy = vi.fn();
    mockRealtime.watch.mockReturnValue(unsubscribeSpy);

    await component.ionViewWillEnter();

    expect(mockRealtime.watch).toHaveBeenCalledTimes(1);
    expect(mockRealtime.watch).toHaveBeenCalledWith(
      'evt-1',
      ['tasks'],
      expect.any(Function),
      expect.anything(),
    );

    const watchedTables = mockRealtime.watch.mock.calls[0][1] as string[];
    expect(watchedTables).toEqual(['tasks']);
    expect(watchedTables).not.toContain('expenses');
    expect(watchedTables).not.toContain('expense_payments');
    expect(watchedTables).not.toContain('expense_categories');

    component.ionViewWillLeave();
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
  });
});
