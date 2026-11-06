import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { RouterLink, provideRouter } from '@angular/router';
import { ToastController } from '@ionic/angular';
import {
  ArrivalSessionService,
  BudgetRepository,
  EventAttendance,
  EventContextService,
  EventRow,
  EventsRepository,
  RealtimeService,
  TaskRow,
  TasksRepository,
  formatCop,
} from '../../../core';
import { EventDashboardPage } from './event-dashboard.page';

const mockEvent: EventRow = {
  id: 'event-123',
  created_by: 'owner-1',
  name: 'Baby Shower Neiva',
  theme_id: 'honey-bee',
  starts_at: '2026-11-29T15:00:00-05:00',
  venue_name: 'Salón Comunitario',
  venue_address: 'Calle 10 # 5-20',
  city: 'Neiva',
  map_url: null,
  welcome_message: null,
  rsvp_deadline: '2026-11-15T23:59:59-05:00',
  budget_cop: null,
  team_id: null,
  created_at: '2026-10-01T00:00:00-05:00',
  updated_at: '2026-10-01T00:00:00-05:00',
};

const mockAttendance: EventAttendance = {
  rsvp: {
    accepted: 25,
    pending: 10,
    declined: 5,
    total: 40,
  },
  arrivals: {
    confirmed: 25,
    arrivedConfirmed: 18,
    arrivedUnconfirmed: 2,
    arrivedTotal: 20,
  },
};

function makeMockTask(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 'task-1',
    event_id: 'event-123',
    title: 'Tarea de prueba',
    note: null,
    assignee_profile_id: null,
    due_date: '2099-12-31',
    done_at: null,
    done_by: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

describe('EventDashboardPage - Arrivals & Attendance', () => {
  let fixture: ComponentFixture<EventDashboardPage>;
  let component: EventDashboardPage;
  let mockEventContext: {
    event: ReturnType<typeof signal<EventRow | null>>;
    isOwner: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    loading: ReturnType<typeof signal<boolean>>;
    load: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
  let mockEventsRepo: {
    attendanceFor: ReturnType<typeof vi.fn>;
  };
  let mockBudgetRepo: {
    committedTotal: ReturnType<typeof vi.fn>;
  };
  let mockArrivalSession: {
    prefetch: ReturnType<typeof vi.fn>;
  };
  let mockTasksRepo: {
    list: ReturnType<typeof vi.fn>;
  };
  let mockRealtime: {
    watch: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockEventContext = {
      event: signal(mockEvent),
      isOwner: signal(true),
      error: signal(null),
      loading: signal(false),
      load: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn(),
    };
    mockEventsRepo = {
      attendanceFor: vi.fn().mockResolvedValue(mockAttendance),
    };
    mockBudgetRepo = {
      committedTotal: vi.fn().mockResolvedValue(0),
    };
    mockArrivalSession = {
      prefetch: vi.fn().mockResolvedValue(undefined),
    };
    mockTasksRepo = {
      list: vi.fn().mockResolvedValue([]),
    };
    mockRealtime = {
      watch: vi.fn().mockReturnValue(() => {}),
    };

    await TestBed.configureTestingModule({
      imports: [EventDashboardPage],
      providers: [
        provideRouter([]),
        { provide: EventContextService, useValue: mockEventContext },
        { provide: EventsRepository, useValue: mockEventsRepo },
        { provide: BudgetRepository, useValue: mockBudgetRepo },
        { provide: TasksRepository, useValue: mockTasksRepo },
        { provide: ArrivalSessionService, useValue: mockArrivalSession },
        { provide: RealtimeService, useValue: mockRealtime },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EventDashboardPage);
    fixture.componentRef.setInput('id', 'event-123');
    component = fixture.componentInstance;
  });

  it('prefetches arrival list and loads attendance data on enter', async () => {
    component.ionViewWillEnter();

    expect(mockArrivalSession.prefetch).toHaveBeenCalledWith('event-123');
    expect(mockEventsRepo.attendanceFor).toHaveBeenCalledWith('event-123');

    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.counts()).toEqual(mockAttendance.rsvp);
    expect(component.arrivals()).toEqual(mockAttendance.arrivals);

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain(
      'Llegadas: 18 de 25 personas confirmadas · 2 sin confirmar',
    );
  });

  it('renders enabled Llegada con QR card with correct route for owners', async () => {
    mockEventContext.isOwner.set(true);
    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    const linkElements = fixture.debugElement.queryAll(By.directive(RouterLink));
    const arrivalElement = linkElements.find((el) =>
      el.nativeElement.textContent?.includes('Llegada con QR'),
    );

    expect(arrivalElement).toBeTruthy();
    expect(
      arrivalElement?.nativeElement.classList.contains('access-card--disabled'),
    ).toBe(false);
    const routerLinkInstance = arrivalElement?.injector.get(RouterLink);
    expect(routerLinkInstance?.urlTree?.toString()).toBe('/eventos/event-123/llegadas');
    expect(arrivalElement?.nativeElement.textContent).not.toContain('Pronto');

    const titles = Array.from(
      fixture.nativeElement.querySelectorAll('.access-card__title'),
    ).map((el) => (el as HTMLElement).textContent?.trim());
    expect(titles).toContain('Invitaciones');
    expect(titles).not.toContain('Mesas');
  });

  it('renders enabled Llegada con QR card with correct route for helpers', async () => {
    mockEventContext.isOwner.set(false);
    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    const linkElements = fixture.debugElement.queryAll(By.directive(RouterLink));
    const arrivalElement = linkElements.find((el) =>
      el.nativeElement.textContent?.includes('Llegada con QR'),
    );

    expect(arrivalElement).toBeTruthy();
    expect(
      arrivalElement?.nativeElement.classList.contains('access-card--disabled'),
    ).toBe(false);
    const routerLinkInstance = arrivalElement?.injector.get(RouterLink);
    expect(routerLinkInstance?.urlTree?.toString()).toBe('/eventos/event-123/llegadas');
    expect(arrivalElement?.nativeElement.textContent).not.toContain('Pronto');
  });

  it('renders countdown card with cover image and aria-hidden wrapper', async () => {
    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    const cover = fixture.nativeElement.querySelector(
      '.countdown-card__cover',
    ) as HTMLElement | null;
    expect(cover).not.toBeNull();
    expect(cover?.getAttribute('aria-hidden')).toBe('true');

    const img = fixture.nativeElement.querySelector(
      '.countdown-card__cover img.countdown-card__cover-image',
    ) as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img?.getAttribute('alt')).toBe('');
    expect(img?.getAttribute('src')).toMatch(/assets\/themes\/honey-bee\/countdown\.webp$/);
  });

  it('renders countdown title, date and deadline text', async () => {
    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    const titleEl = fixture.nativeElement.querySelector(
      '.countdown-card__title',
    ) as HTMLElement | null;
    const datetimeEl = fixture.nativeElement.querySelector(
      '.countdown-card__datetime',
    ) as HTMLElement | null;
    const deadlineEl = fixture.nativeElement.querySelector(
      '.countdown-card__deadline',
    ) as HTMLElement | null;

    expect(titleEl?.textContent?.trim()).toBe(component.countdownTitle());
    expect(datetimeEl?.textContent?.replace(/\s+/g, ' ').trim()).toContain(
      component.eventDateText(),
    );
    expect(deadlineEl?.textContent?.replace(/\s+/g, ' ').trim()).toContain(
      `Límite para confirmar: ${component.deadlineDateText()}`,
    );
  });

  it('renders updated KPI attendance labels', async () => {
    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    const kpiLabels = Array.from(
      fixture.nativeElement.querySelectorAll('.kpi-card__label'),
    ).map((el) => (el as HTMLElement).textContent?.trim());

    expect(kpiLabels).toEqual(['Confirmaron', 'Sin respuesta', 'No asistirán']);
  });

  it('renders budget card with link to presupuesto and "Van $ X de $ Y" for owner with budget', async () => {
    mockEventContext.isOwner.set(true);
    mockEventContext.event.set({
      ...mockEvent,
      budget_cop: 5_000_000,
    });
    mockBudgetRepo.committedTotal.mockResolvedValue(2_200_000);

    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockBudgetRepo.committedTotal).toHaveBeenCalledWith('event-123');

    const linkElements = fixture.debugElement.queryAll(By.directive(RouterLink));
    const budgetElement = linkElements.find((el) =>
      el.nativeElement.textContent?.includes('Presupuesto y gastos'),
    );

    expect(budgetElement).toBeTruthy();
    expect(
      budgetElement?.nativeElement.classList.contains('access-card--disabled'),
    ).toBe(false);
    const routerLinkInstance = budgetElement?.injector.get(RouterLink);
    expect(routerLinkInstance?.urlTree?.toString()).toBe('/eventos/event-123/presupuesto');
    expect(budgetElement?.nativeElement.textContent).not.toContain('Pronto');

    const summaryEl = budgetElement?.nativeElement.querySelector(
      '.access-card__summary',
    ) as HTMLElement | null;
    expect(summaryEl).not.toBeNull();
    const expectedText = `Van ${formatCop(2_200_000)} de ${formatCop(5_000_000)}`;
    expect(summaryEl?.textContent?.trim()).toBe(expectedText);
  });

  it('renders "Van $ X en gastos" summary when owner has no defined budget', async () => {
    mockEventContext.isOwner.set(true);
    mockEventContext.event.set({
      ...mockEvent,
      budget_cop: null,
    });
    mockBudgetRepo.committedTotal.mockResolvedValue(1_800_000);

    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockBudgetRepo.committedTotal).toHaveBeenCalledWith('event-123');

    const summaryEl = fixture.nativeElement.querySelector(
      '.access-card__summary',
    ) as HTMLElement | null;
    expect(summaryEl).not.toBeNull();
    const expectedText = `Van ${formatCop(1_800_000)} en gastos`;
    expect(summaryEl?.textContent?.trim()).toBe(expectedText);
  });

  it('renders enabled Tareas card with routerLink to tareas without Pronto for owner', async () => {
    mockEventContext.isOwner.set(true);
    mockTasksRepo.list.mockResolvedValue([]);

    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    const linkElements = fixture.debugElement.queryAll(By.directive(RouterLink));
    const tasksElement = linkElements.find((el) =>
      el.nativeElement.textContent?.includes('Tareas'),
    );

    expect(tasksElement).toBeTruthy();
    expect(
      tasksElement?.nativeElement.classList.contains('access-card--disabled'),
    ).toBe(false);
    const routerLinkInstance = tasksElement?.injector.get(RouterLink);
    expect(routerLinkInstance?.urlTree?.toString()).toBe('/eventos/event-123/tareas');
    expect(tasksElement?.nativeElement.textContent).not.toContain('Pronto');
  });

  it('renders enabled Tareas card with routerLink to tareas without Pronto for helper', async () => {
    mockEventContext.isOwner.set(false);
    mockTasksRepo.list.mockResolvedValue([]);

    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    const linkElements = fixture.debugElement.queryAll(By.directive(RouterLink));
    const tasksElement = linkElements.find((el) =>
      el.nativeElement.textContent?.includes('Tareas'),
    );

    expect(tasksElement).toBeTruthy();
    expect(
      tasksElement?.nativeElement.classList.contains('access-card--disabled'),
    ).toBe(false);
    const routerLinkInstance = tasksElement?.injector.get(RouterLink);
    expect(routerLinkInstance?.urlTree?.toString()).toBe('/eventos/event-123/tareas');
    expect(tasksElement?.nativeElement.textContent).not.toContain('Pronto');
  });

  it('displays all four tasksCardText summaries on the tasks card', async () => {
    mockEventContext.isOwner.set(true);

    // 1. Sin tareas
    mockTasksRepo.list.mockResolvedValue([]);
    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.tasksSummaryText()).toBe('Sin tareas');
    expect(fixture.nativeElement.textContent).toContain('Sin tareas');

    // 2. Sin pendientes (todas hechas)
    mockTasksRepo.list.mockResolvedValue([
      makeMockTask({ id: 't1', done_at: '2026-11-01T10:00:00Z' }),
    ]);
    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.tasksSummaryText()).toBe('Sin pendientes');
    expect(fixture.nativeElement.textContent).toContain('Sin pendientes');

    // 3. 4 pendientes (ninguna vencida: due_date en el futuro)
    mockTasksRepo.list.mockResolvedValue([
      makeMockTask({ id: 't1', due_date: '2099-12-01' }),
      makeMockTask({ id: 't2', due_date: '2099-12-02' }),
      makeMockTask({ id: 't3', due_date: '2099-12-03' }),
      makeMockTask({ id: 't4', due_date: '2099-12-04' }),
    ]);
    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.tasksSummaryText()).toBe('4 pendientes');
    expect(fixture.nativeElement.textContent).toContain('4 pendientes');

    // 4. 4 pendientes, 1 vencida (1 en el pasado, 3 en el futuro)
    mockTasksRepo.list.mockResolvedValue([
      makeMockTask({ id: 't1', due_date: '2000-01-01' }),
      makeMockTask({ id: 't2', due_date: '2099-12-02' }),
      makeMockTask({ id: 't3', due_date: '2099-12-03' }),
      makeMockTask({ id: 't4', due_date: '2099-12-04' }),
    ]);
    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.tasksSummaryText()).toBe('4 pendientes, 1 vencida');
    expect(fixture.nativeElement.textContent).toContain('4 pendientes, 1 vencida');
  });

  it('calls tasksRepo.list but never BudgetRepository for helpers', async () => {
    mockEventContext.isOwner.set(false);
    mockTasksRepo.list.mockResolvedValue([]);

    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockTasksRepo.list).toHaveBeenCalledWith('event-123');
    expect(mockBudgetRepo.committedTotal).not.toHaveBeenCalled();
  });

  it('renders tasks card without summary and without error toast if list fails', async () => {
    mockEventContext.isOwner.set(true);
    mockTasksRepo.list.mockRejectedValue(new Error('Network error'));
    const toastCtrl = TestBed.inject(ToastController);
    const toastSpy = vi.spyOn(toastCtrl, 'create');

    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockTasksRepo.list).toHaveBeenCalledWith('event-123');
    expect(component.tasksSummaryText()).toBeNull();

    const linkElements = fixture.debugElement.queryAll(By.directive(RouterLink));
    const tasksElement = linkElements.find((el) =>
      el.nativeElement.textContent?.includes('Tareas'),
    );
    expect(tasksElement).toBeTruthy();
    expect(tasksElement?.nativeElement.querySelector('.access-card__summary')).toBeNull();
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it('includes tasks in realtime watch', () => {
    component.ionViewWillEnter();
    expect(mockRealtime.watch).toHaveBeenCalledWith(
      'event-123',
      ['events', 'guests', 'tasks'],
      expect.any(Function),
      expect.anything(),
    );
  });

  it('does not render budget card or mentions and never calls committedTotal for helpers', async () => {
    mockEventContext.isOwner.set(false);
    mockEventContext.event.set({
      ...mockEvent,
      budget_cop: 5_000_000,
    });

    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockBudgetRepo.committedTotal).not.toHaveBeenCalled();
    const domText = fixture.nativeElement.textContent ?? '';
    expect(domText).not.toContain('Presupuesto');
    expect(domText).not.toContain('5.000.000');
    expect(domText).not.toContain('5000000');
    expect(component.budgetSummaryText()).toBeNull();
  });

  it('renders budget card without summary and without error toast if committedTotal fails', async () => {
    mockEventContext.isOwner.set(true);
    mockBudgetRepo.committedTotal.mockRejectedValue(new Error('Fetch failed'));
    const toastCtrl = TestBed.inject(ToastController);
    const toastSpy = vi.spyOn(toastCtrl, 'create');

    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockBudgetRepo.committedTotal).toHaveBeenCalledWith('event-123');
    expect(component.budgetSummaryText()).toBeNull();

    const linkElements = fixture.debugElement.queryAll(By.directive(RouterLink));
    const budgetElement = linkElements.find((el) =>
      el.nativeElement.textContent?.includes('Presupuesto y gastos'),
    );
    expect(budgetElement).toBeTruthy();
    expect(budgetElement?.nativeElement.querySelector('.access-card__summary')).toBeNull();
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it('resets budgetSummaryText and tasksSummaryText to null when changing event on enter', async () => {
    component.budgetSummaryText.set('Van $ 500.000 en gastos');
    component.tasksSummaryText.set('Sin pendientes');
    mockEventContext.event.set(mockEvent);

    fixture.componentRef.setInput('id', 'event-999');
    component.ionViewWillEnter();

    expect(mockEventContext.clear).toHaveBeenCalled();
    expect(component.budgetSummaryText()).toBeNull();
    expect(component.tasksSummaryText()).toBeNull();
  });
});
