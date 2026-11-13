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
  TeamProfileRow,
  TeamProfilesRepository,
  formatCop,
} from '../../../core';
import { ExpenseDetailPage } from './expense-detail.page';

describe('ExpenseDetailPage', () => {
  let fixture: ComponentFixture<ExpenseDetailPage>;
  let component: ExpenseDetailPage;
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
    getExpense: ReturnType<typeof vi.fn>;
    listCategories: ReturnType<typeof vi.fn>;
    removeExpense: ReturnType<typeof vi.fn>;
    removePayment: ReturnType<typeof vi.fn>;
  };
  let mockTeamProfilesRepo: {
    list: ReturnType<typeof vi.fn>;
    canManage: ReturnType<typeof vi.fn>;
  };
  let router: Router;
  let mockModalCtrl: {
    create: ReturnType<typeof vi.fn>;
  };
  let mockAlertCtrl: {
    create: ReturnType<typeof vi.fn>;
  };
  let mockToastCtrl: {
    create: ReturnType<typeof vi.fn>;
  };

  const mockCategories: ExpenseCategoryRow[] = [
    {
      id: 'cat-1',
      event_id: 'evt-1',
      name: 'Comida y bebidas',
      sort_order: 1,
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
    {
      id: 'prof-2',
      team_id: 'team-1',
      name: 'Laura (archivada)',
      sort_order: 2,
      archived_at: '2026-10-20T00:00:00Z',
      created_at: '2026-10-01T00:00:00Z',
    },
  ];

  const mockPartialExpense: ExpenseWithPayments = {
    id: 'exp-1',
    event_id: 'evt-1',
    category_id: 'cat-1',
    description: 'Bebidas y hielo',
    amount_cop: 200000,
    note: 'Llevar factura',
    task_id: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    payments: [
      {
        id: 'pay-1',
        event_id: 'evt-1',
        expense_id: 'exp-1',
        amount_cop: 60000,
        paid_on: '2026-10-15',
        paid_by_profile_id: 'prof-1',
        created_at: '2026-10-15T10:00:00Z',
      },
    ],
    task: null,
  };

  const mockPaidExpense: ExpenseWithPayments = {
    id: 'exp-2',
    event_id: 'evt-1',
    category_id: 'cat-1',
    description: 'Alquiler de sillas',
    amount_cop: 150000,
    note: null,
    task_id: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    payments: [
      {
        id: 'pay-2',
        event_id: 'evt-1',
        expense_id: 'exp-2',
        amount_cop: 150000,
        paid_on: '2026-10-10',
        paid_by_profile_id: 'prof-2',
        created_at: '2026-10-10T10:00:00Z',
      },
    ],
    task: null,
  };

  const mockExpenseWithTask: ExpenseWithPayments = {
    id: 'exp-3',
    event_id: 'evt-1',
    category_id: 'cat-1',
    description: 'Torta del baby shower',
    amount_cop: 180000,
    note: null,
    task_id: 'task-1',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    payments: [],
    task: {
      id: 'task-1',
      title: 'Pedir la torta temática',
      done_at: null,
    },
  };

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
      getExpense: vi.fn().mockResolvedValue(mockPartialExpense),
      listCategories: vi.fn().mockResolvedValue(mockCategories),
      removeExpense: vi.fn().mockResolvedValue(undefined),
      removePayment: vi.fn().mockResolvedValue(undefined),
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

    await TestBed.configureTestingModule({
      imports: [ExpenseDetailPage],
      providers: [
        provideRouter([]),
        { provide: EventContextService, useValue: mockEventContext },
        { provide: BudgetRepository, useValue: mockBudgetRepo },
        { provide: TeamProfilesRepository, useValue: mockTeamProfilesRepo },
        { provide: ModalController, useValue: mockModalCtrl },
        { provide: AlertController, useValue: mockAlertCtrl },
        { provide: ToastController, useValue: mockToastCtrl },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(ExpenseDetailPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('id', 'evt-1');
    fixture.componentRef.setInput('expenseId', 'exp-1');
  });

  it('redirige al panel si el rol no es propietario', async () => {
    mockEventContext.role.set('helper');
    mockEventContext.isOwner.set(false);

    await component.ionViewWillEnter();

    expect(router.navigate).toHaveBeenCalledWith(['/eventos', 'evt-1', 'panel'], {
      replaceUrl: true,
    });
    expect(mockBudgetRepo.getExpense).not.toHaveBeenCalled();
  });

  it('muestra estado abonado y saldo faltante', async () => {
    await component.ionViewWillEnter();
    fixture.detectChanges();

    expect(component.status()).toBe('partial');
    expect(component.statusLabel()).toBe('Abonado');
    expect(component.balance()).toBe(140000);

    const balanceEl = fixture.debugElement.query(By.css('.balance-missing'));
    expect(balanceEl).not.toBeNull();
    expect(balanceEl.nativeElement.textContent).toContain(`Faltan ${formatCop(140000)}`);

    const registerBtn = fixture.debugElement.query(By.css('.register-payment-btn'));
    expect(registerBtn).not.toBeNull();
  });

  it('muestra estado pagado sin botón de "Registrar pago" y con el aviso correspondiente', async () => {
    mockBudgetRepo.getExpense.mockResolvedValue(mockPaidExpense);
    fixture.componentRef.setInput('expenseId', 'exp-2');

    await component.ionViewWillEnter();
    fixture.detectChanges();

    expect(component.status()).toBe('paid');
    expect(component.statusLabel()).toBe('Pagado');

    const registerBtn = fixture.debugElement.query(By.css('.register-payment-btn'));
    expect(registerBtn).toBeNull();

    const paidNotice = fixture.debugElement.query(By.css('.paid-notice'));
    expect(paidNotice).not.toBeNull();
    expect(paidNotice.nativeElement.textContent).toContain('Este gasto ya está pagado.');
  });

  it('confirma borrado de gasto sin pagos', async () => {
    mockBudgetRepo.getExpense.mockResolvedValue({
      ...mockPartialExpense,
      payments: [],
    });

    await component.ionViewWillEnter();
    await component.confirmDeleteExpense();

    expect(mockAlertCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        header: 'Borrar gasto',
        message: `¿Borrar ${mockPartialExpense.description}?`,
      }),
    );
  });

  it('confirma borrado de gasto con pagos indicando el monto pagado', async () => {
    await component.ionViewWillEnter();
    await component.confirmDeleteExpense();

    expect(mockAlertCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        header: 'Borrar gasto',
        message: `¿Borrar ${mockPartialExpense.description}? Ya se habían pagado ${formatCop(60000)} y esos pagos también se borran.`,
      }),
    );
  });

  it('confirma borrado de gasto con tarea agregando "La tarea se conserva."', async () => {
    mockBudgetRepo.getExpense.mockResolvedValue(mockExpenseWithTask);
    fixture.componentRef.setInput('expenseId', 'exp-3');

    await component.ionViewWillEnter();
    await component.confirmDeleteExpense();

    expect(mockAlertCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        header: 'Borrar gasto',
        message: `¿Borrar ${mockExpenseWithTask.description}? La tarea se conserva.`,
      }),
    );
  });

  it('muestra estado vacío cuando el gasto ya no existe', async () => {
    mockBudgetRepo.getExpense.mockResolvedValue(null);

    await component.ionViewWillEnter();
    fixture.detectChanges();

    const emptyState = fixture.debugElement.query(By.css('app-empty-state'));
    expect(emptyState).not.toBeNull();
    expect(emptyState.nativeElement.textContent).toContain('Este gasto ya no existe.');
  });

  it('confirma y borra un pago individualmente', async () => {
    await component.ionViewWillEnter();
    const payment = mockPartialExpense.payments[0];

    await component.confirmDeletePayment(payment);

    expect(mockAlertCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        header: 'Borrar pago',
        message: `¿Borrar este pago de ${formatCop(60000)}?`,
      }),
    );
  });
});
