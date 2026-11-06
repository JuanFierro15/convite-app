import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { AlertController, ModalController, ToastController } from '@ionic/angular';
import {
  BudgetRepository,
  EventContextService,
  EventRole,
  EventRow,
  RealtimeService,
  TaskExpenseLink,
  TaskRow,
  TasksRepository,
  TeamProfileRow,
  TeamProfilesRepository,
} from '../../../core';
import { PaymentFormComponent } from '../../presupuesto/formularios/payment-form.component';
import { TaskFormComponent } from '../formulario/task-form.component';
import { TasksPage } from './tasks.page';

describe('TasksPage', () => {
  let fixture: ComponentFixture<TasksPage>;
  let component: TasksPage;

  let mockEventContext: {
    event: ReturnType<typeof signal<EventRow | null>>;
    role: ReturnType<typeof signal<EventRole | null>>;
    isOwner: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    loading: ReturnType<typeof signal<boolean>>;
    load: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
  let mockTasksRepo: {
    list: ReturnType<typeof vi.fn>;
    setDone: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  let mockBudgetRepo: {
    linksForTasks: ReturnType<typeof vi.fn>;
  };
  let mockTeamProfilesRepo: {
    list: ReturnType<typeof vi.fn>;
    canManage: ReturnType<typeof vi.fn>;
  };
  let mockRealtime: {
    watch: ReturnType<typeof vi.fn>;
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
  let mockStopRealtime: ReturnType<typeof vi.fn>;

  const mockEvent: EventRow = {
    id: 'evt-1',
    created_by: 'user-1',
    name: 'Baby Shower de Ejemplo',
    starts_at: '2026-11-29T15:00:00-05:00',
    rsvp_deadline: '2026-11-14T23:59:59-05:00',
    venue_name: 'Casa Campestre',
    venue_address: 'Calle 1 # 2-3',
    city: 'Neiva',
    map_url: null,
    welcome_message: null,
    theme_id: 'honey-bee',
    budget_cop: null,
    team_id: 'team-1',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  };

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
      name: 'Laura',
      sort_order: 2,
      archived_at: null,
      created_at: '2026-10-01T00:00:00Z',
    },
  ];

  const mockTasks: TaskRow[] = [
    {
      id: 'task-overdue',
      event_id: 'evt-1',
      title: 'Comprar cinta decorativa',
      note: null,
      assignee_profile_id: 'prof-1',
      due_date: '2026-11-01', // Vencida respecto a 2026-11-05
      done_at: null,
      done_by: null,
      created_at: '2026-10-10T00:00:00Z',
      updated_at: '2026-10-10T00:00:00Z',
    },
    {
      id: 'task-upcoming',
      event_id: 'evt-1',
      title: 'Recoger la torta',
      note: null,
      assignee_profile_id: 'prof-2',
      due_date: '2026-11-28',
      done_at: null,
      done_by: null,
      created_at: '2026-10-12T00:00:00Z',
      updated_at: '2026-10-12T00:00:00Z',
    },
    {
      id: 'task-done',
      event_id: 'evt-1',
      title: 'Reservar el local',
      note: null,
      assignee_profile_id: null,
      due_date: '2026-10-20',
      done_at: '2026-10-20T10:00:00Z',
      done_by: 'user-1',
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-20T10:00:00Z',
    },
  ];

  const mockLinks: TaskExpenseLink[] = [
    {
      task_id: 'task-upcoming',
      expense_id: 'exp-1',
      description: 'Torta de fresas',
      amount_cop: 150000,
      paid_cop: 50000, // Abonado: falta 100.000 por pagar
    },
  ];

  beforeEach(async () => {
    mockStopRealtime = vi.fn();
    mockEventContext = {
      event: signal<EventRow | null>(mockEvent),
      role: signal<EventRole | null>('owner'),
      isOwner: signal<boolean>(true),
      error: signal<string | null>(null),
      loading: signal<boolean>(false),
      load: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn(),
    };

    mockTasksRepo = {
      list: vi.fn().mockResolvedValue([...mockTasks]),
      setDone: vi.fn().mockImplementation((id: string, done: boolean) =>
        Promise.resolve({
          id,
          done_at: done ? '2026-11-05T12:00:00Z' : null,
          done_by: done ? 'user-1' : null,
        }),
      ),
      save: vi.fn().mockResolvedValue(mockTasks[0]),
      remove: vi.fn().mockResolvedValue({ deleted_expense: false }),
    };

    mockBudgetRepo = {
      linksForTasks: vi.fn().mockResolvedValue([...mockLinks]),
    };

    mockTeamProfilesRepo = {
      list: vi.fn().mockResolvedValue([...mockProfiles]),
      canManage: vi.fn().mockResolvedValue(true),
    };

    mockRealtime = {
      watch: vi.fn().mockReturnValue(mockStopRealtime),
    };

    mockModalCtrl = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
        onWillDismiss: vi.fn().mockResolvedValue({ role: 'cancel' }),
      }),
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
      imports: [TasksPage],
      providers: [
        provideRouter([]),
        { provide: EventContextService, useValue: mockEventContext },
        { provide: TasksRepository, useValue: mockTasksRepo },
        { provide: BudgetRepository, useValue: mockBudgetRepo },
        { provide: TeamProfilesRepository, useValue: mockTeamProfilesRepo },
        { provide: RealtimeService, useValue: mockRealtime },
        { provide: ModalController, useValue: mockModalCtrl },
        { provide: AlertController, useValue: mockAlertCtrl },
        { provide: ToastController, useValue: mockToastCtrl },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TasksPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('id', 'evt-1');
  });

  it('muestra tres grupos y mantiene Hechas plegadas por defecto', async () => {
    component.today.set('2026-11-05');
    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    // Grupo Vencidas
    const overdueSection = compiled.querySelector('section[aria-labelledby="overdue-heading"]');
    expect(overdueSection).not.toBeNull();
    expect(overdueSection?.textContent).toContain('Vencidas');
    expect(overdueSection?.textContent).toContain('Comprar cinta decorativa');

    // Grupo Próximas
    const upcomingSection = compiled.querySelector('section[aria-labelledby="upcoming-heading"]');
    expect(upcomingSection).not.toBeNull();
    expect(upcomingSection?.textContent).toContain('Próximas');
    expect(upcomingSection?.textContent).toContain('Recoger la torta');

    // Grupo Hechas plegado
    const doneToggle = compiled.querySelector('.done-toggle-btn');
    expect(doneToggle).not.toBeNull();
    expect(doneToggle?.textContent).toContain('Hechas (1)');
    expect(doneToggle?.getAttribute('aria-expanded')).toBe('false');

    // La lista de hechas está oculta mientras esté plegada
    expect(compiled.querySelector('.tasks-group--done .tasks-list')).toBeNull();

    // Desplegar Hechas
    component.toggleShowDone();
    fixture.detectChanges();

    expect(doneToggle?.getAttribute('aria-expanded')).toBe('true');
    const doneList = compiled.querySelector('.tasks-group--done .tasks-list');
    expect(doneList).not.toBeNull();
    expect(doneList?.textContent).toContain('Reservar el local');
  });

  it('filtra por perfil y por Sin asignar', async () => {
    component.today.set('2026-11-05');
    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    // Filtro por Juan (prof-1)
    component.selectedFilter.set('prof-1');
    expect(component.filteredTasks().map((t) => t.id)).toEqual(['task-overdue']);

    // Filtro por Sin asignar
    component.selectedFilter.set('unassigned');
    expect(component.filteredTasks().map((t) => t.id)).toEqual(['task-done']);

    // Filtro sin resultados
    component.selectedFilter.set('prof-inexistente');
    expect(component.filteredTasks().length).toBe(0);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No hay tareas de este perfil.');
  });

  it('ayudante: sin botones de agregar ni editar, sin llamadas a BudgetRepository ni canManage, y sin mención de gasto', async () => {
    mockEventContext.isOwner.set(false);
    mockEventContext.role.set('helper');

    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockBudgetRepo.linksForTasks).not.toHaveBeenCalled();
    expect(mockTeamProfilesRepo.canManage).not.toHaveBeenCalled();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.top-actions')).toBeNull();
    expect(compiled.querySelector('.task-edit-btn')).toBeNull();
    expect(compiled.textContent?.toLowerCase()).not.toContain('gasto');
  });

  it('marca una tarea y revierte optimismo si falla la petición', async () => {
    component.today.set('2026-11-05');
    component.ionViewWillEnter();
    await fixture.whenStable();

    mockTasksRepo.setDone.mockRejectedValueOnce(new Error('Sin conexión'));

    const taskToToggle = component.tasks().find((t) => t.id === 'task-overdue')!;
    await component.toggleTaskDone(taskToToggle);

    // Debe haberse revertido a done_at: null
    const taskAfter = component.tasks().find((t) => t.id === 'task-overdue')!;
    expect(taskAfter.done_at).toBeNull();
    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Sin conexión' }),
    );
  });

  it('pregunta de pago: propietario con gasto abonado sí, pagado no, deshacer no, ayudante no', async () => {
    component.today.set('2026-11-05');
    component.ionViewWillEnter();
    await fixture.whenStable();

    // 1. Propietario marcando tarea con gasto abonado (task-upcoming tiene saldo 100.000)
    const taskUpcoming = component.tasks().find((t) => t.id === 'task-upcoming')!;
    await component.toggleTaskDone(taskUpcoming);

    expect(mockAlertCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        cssClass: 'convite-alert',
        header: '¿Registrar el pago?',
        message: expect.stringContaining('Esta tarea tiene un gasto con'),
      }),
    );

    mockAlertCtrl.create.mockClear();

    // 2. Gasto pagado del todo: no debe preguntar
    component.links.set([
      {
        task_id: 'task-overdue',
        expense_id: 'exp-2',
        description: 'Cintas',
        amount_cop: 50000,
        paid_cop: 50000, // Totalmente pagado
      },
    ]);
    const taskOverdue = component.tasks().find((t) => t.id === 'task-overdue')!;
    await component.toggleTaskDone(taskOverdue);
    expect(mockAlertCtrl.create).not.toHaveBeenCalled();

    // 3. Deshacer / desmarcar una tarea hecha: no debe preguntar
    mockAlertCtrl.create.mockClear();
    const taskDone = component.tasks().find((t) => t.id === 'task-done')!;
    await component.toggleTaskDone(taskDone);
    expect(mockAlertCtrl.create).not.toHaveBeenCalled();

    // 4. Ayudante marcando: nunca debe preguntar
    mockEventContext.isOwner.set(false);
    mockAlertCtrl.create.mockClear();
    await component.toggleTaskDone(taskUpcoming);
    expect(mockAlertCtrl.create).not.toHaveBeenCalled();
  });

  it('botón Registrar pago abre el formulario con el saldo restante', async () => {
    component.today.set('2026-11-05');
    component.ionViewWillEnter();
    await fixture.whenStable();

    const taskUpcoming = component.tasks().find((t) => t.id === 'task-upcoming')!;
    await component.toggleTaskDone(taskUpcoming);

    const alertConfig = mockAlertCtrl.create.mock.calls[0][0];
    const registerBtn = alertConfig.buttons.find(
      (b: { text: string }) => b.text === 'Registrar pago',
    );
    expect(registerBtn).toBeDefined();

    // Ejecutamos el handler del botón "Registrar pago"
    await registerBtn.handler();

    // Comprobamos que abre la hoja modal con el saldo (150.000 - 50.000 = 100.000)
    expect(mockModalCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        component: PaymentFormComponent,
        componentProps: expect.objectContaining({
          expenseId: 'exp-1',
          balance: 100000,
        }),
      }),
    );
  });

  it('tocar el lápiz de editar no marca la tarea', () => {
    component.today.set('2026-11-05');
    component.ionViewWillEnter();

    const mockEventObj = {
      stopPropagation: vi.fn(),
    } as unknown as MouseEvent;

    const task = component.tasks()[0];
    component.onEditTask(mockEventObj, task);

    expect(mockEventObj.stopPropagation).toHaveBeenCalled();
    expect(mockTasksRepo.setDone).not.toHaveBeenCalled();
    expect(mockModalCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        component: TaskFormComponent,
        componentProps: expect.objectContaining({ task }),
      }),
    );
  });

  it('borrar tarea en sus tres casos con la casilla desmarcada por defecto', async () => {
    component.today.set('2026-11-05');
    component.ionViewWillEnter();
    await fixture.whenStable();

    // Modal que se cierra con role: 'delete'
    mockModalCtrl.create.mockResolvedValue({
      present: vi.fn().mockResolvedValue(undefined),
      onWillDismiss: vi.fn().mockResolvedValue({ role: 'delete' }),
    });

    // Caso 1: Sin gasto (task-overdue no tiene link)
    const taskSinGasto = component.tasks().find((t) => t.id === 'task-overdue')!;
    await component.openTaskModal(taskSinGasto);

    expect(mockAlertCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        header: 'Borrar tarea',
        message: '¿Borrar Comprar cinta decorativa?',
      }),
    );

    // Caso 2: Gasto sin pagos
    mockAlertCtrl.create.mockClear();
    component.links.set([
      {
        task_id: 'task-overdue',
        expense_id: 'exp-sin-pagos',
        description: 'Cintas',
        amount_cop: 25000,
        paid_cop: 0,
      },
      {
        task_id: 'task-upcoming',
        expense_id: 'exp-1',
        description: 'Torta de fresas',
        amount_cop: 150000,
        paid_cop: 50000,
      },
    ]);

    await component.openTaskModal(taskSinGasto);

    expect(mockAlertCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        header: 'Borrar tarea',
        message: expect.stringContaining('Tiene un gasto de'),
        inputs: [
          expect.objectContaining({
            type: 'checkbox',
            label: 'Borrar también el gasto',
            checked: false,
          }),
        ],
      }),
    );

    // Caso 3: Gasto con pagos (task-upcoming tiene pagos)
    mockAlertCtrl.create.mockClear();
    const taskConPagos = component.tasks().find((t) => t.id === 'task-upcoming')!;
    await component.openTaskModal(taskConPagos);

    expect(mockAlertCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        header: 'Borrar tarea',
        message:
          '¿Borrar Recoger la torta? Su gasto tiene pagos, así que se conserva y queda sin tarea.',
      }),
    );
  });

  it('Realtime: watch con [tasks] al entrar y detenido al salir', () => {
    component.ionViewWillEnter();
    expect(mockRealtime.watch).toHaveBeenCalledWith(
      'evt-1',
      ['tasks'],
      expect.any(Function),
      expect.anything(),
    );

    component.ionViewWillLeave();
    expect(mockStopRealtime).toHaveBeenCalled();
  });
});
