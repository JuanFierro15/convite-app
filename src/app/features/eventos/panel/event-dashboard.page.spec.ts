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
  RsvpLogEntry,
  RsvpLogRepository,
  TaskRow,
  TasksRepository,
  formatCop,
} from '../../../core';
import { PhotoCacheService } from '../../../core/photos/photo-cache.service';
import { EventPhoto } from '../../../core/photos/photo.models';
import { PhotosRepository } from '../../../core/photos/photos.repository';
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

function makeMockPhoto(id: string, overrides: Partial<EventPhoto> = {}): EventPhoto {
  return {
    id,
    eventId: 'event-123',
    uploadedBy: 'user-1',
    uploaderName: 'Usuario 1',
    uploaderRole: 'owner',
    createdAt: '2026-11-10T12:00:00-05:00',
    width: 1600,
    height: 1200,
    sizeBytes: 150_000,
    photoPath: `event-123/${id}.jpg`,
    thumbPath: `event-123/${id}_thumb.jpg`,
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
  let mockRsvpLogRepo: {
    list: ReturnType<typeof vi.fn>;
  };
  let mockRealtime: {
    watch: ReturnType<typeof vi.fn>;
  };
  let mockPhotosRepo: {
    list: ReturnType<typeof vi.fn>;
  };
  let mockPhotoCache: {
    peek: ReturnType<typeof vi.fn>;
    getUrl: ReturnType<typeof vi.fn>;
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
    mockRsvpLogRepo = {
      list: vi.fn().mockResolvedValue({ total: 0, items: [] }),
    };
    mockRealtime = {
      watch: vi.fn().mockReturnValue(() => {}),
    };
    mockPhotosRepo = {
      list: vi.fn().mockResolvedValue([]),
    };
    mockPhotoCache = {
      peek: vi.fn().mockReturnValue(null),
      getUrl: vi.fn().mockImplementation((path: string) => Promise.resolve(`blob:${path}`)),
    };

    await TestBed.configureTestingModule({
      imports: [EventDashboardPage],
      providers: [
        provideRouter([]),
        { provide: EventContextService, useValue: mockEventContext },
        { provide: EventsRepository, useValue: mockEventsRepo },
        { provide: BudgetRepository, useValue: mockBudgetRepo },
        { provide: TasksRepository, useValue: mockTasksRepo },
        { provide: RsvpLogRepository, useValue: mockRsvpLogRepo },
        { provide: ArrivalSessionService, useValue: mockArrivalSession },
        { provide: RealtimeService, useValue: mockRealtime },
        { provide: PhotosRepository, useValue: mockPhotosRepo },
        { provide: PhotoCacheService, useValue: mockPhotoCache },
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

    mockTasksRepo.list.mockResolvedValue([]);
    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.tasksSummaryText()).toBe('Sin tareas');
    expect(fixture.nativeElement.textContent).toContain('Sin tareas');

    mockTasksRepo.list.mockResolvedValue([
      makeMockTask({ id: 't1', done_at: '2026-11-01T10:00:00Z' }),
    ]);
    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.tasksSummaryText()).toBe('Sin pendientes');
    expect(fixture.nativeElement.textContent).toContain('Sin pendientes');

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

  it('includes tasks, rsvp_log and event_photos in realtime watch', () => {
    component.ionViewWillEnter();
    expect(mockRealtime.watch).toHaveBeenCalledWith(
      'event-123',
      ['events', 'guests', 'tasks', 'rsvp_log', 'event_photos'],
      expect.any(Function),
      expect.anything(),
    );
  });

  it('calls eventContext.load with { force: true } when realtime watch callback is invoked', async () => {
    component.ionViewWillEnter();
    await fixture.whenStable();

    const watchCallback = mockRealtime.watch.mock.calls[0][2] as () => void;
    mockEventContext.load.mockClear();

    watchCallback();
    await fixture.whenStable();

    expect(mockEventContext.load).toHaveBeenCalledWith('event-123', { force: true });
    expect(component.loading()).toBe(false);
  });

  it('updates countdown title from "Falta 1 día" to "Es hoy" when passing midnight in Bogota', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-28T23:59:00-05:00'));

      component.ionViewWillEnter();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.countdownTitle()).toBe('Falta 1 día');
      expect(fixture.nativeElement.textContent).toContain('Falta 1 día');

      vi.advanceTimersByTime(120_000);
      fixture.detectChanges();

      expect(component.countdownTitle()).toBe('Es hoy');
      expect(fixture.nativeElement.textContent).toContain('Es hoy');
    } finally {
      component.ionViewWillLeave();
      vi.useRealTimers();
    }
  });

  it('counts task due on Nov 28 as overdue after midnight without reloading tasks', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-28T23:59:00-05:00'));

      mockTasksRepo.list.mockResolvedValue([
        makeMockTask({
          id: 'task-nov-28',
          due_date: '2026-11-28',
          done_at: null,
        }),
      ]);

      component.ionViewWillEnter();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(mockTasksRepo.list).toHaveBeenCalledTimes(1);
      expect(component.tasksSummaryText()).toBe('1 pendiente');
      expect(fixture.nativeElement.textContent).toContain('1 pendiente');

      vi.advanceTimersByTime(120_000);
      fixture.detectChanges();

      expect(mockTasksRepo.list).toHaveBeenCalledTimes(1);
      expect(component.tasksSummaryText()).toBe('1 pendiente, 1 vencida');
      expect(fixture.nativeElement.textContent).toContain('1 pendiente, 1 vencida');
    } finally {
      component.ionViewWillLeave();
      vi.useRealTimers();
    }
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
    component.tasks.set([makeMockTask()]);
    mockEventContext.event.set(mockEvent);

    fixture.componentRef.setInput('id', 'event-999');
    component.ionViewWillEnter();

    expect(mockEventContext.clear).toHaveBeenCalled();
    expect(component.budgetSummaryText()).toBeNull();
    expect(component.tasksSummaryText()).toBeNull();
  });

  describe('Recent RSVP Section', () => {
    function makeMockRsvpEntry(id: string, name: string): RsvpLogEntry {
      return {
        id,
        invitation_id: `inv-${id}`,
        guest_id: `guest-${id}`,
        guest_name: name,
        group_name: `Grupo ${name}`,
        invitation_kind: 'group',
        previous_rsvp: 'pending',
        rsvp: 'accepted',
        source: 'guest',
        actor_name: null,
        created_at: '2026-11-07T14:50:00-05:00',
      };
    }

    it('renders up to 3 recent rsvps and "Ver todas (N)" button pointing to /eventos/{id}/respuestas', async () => {
      const items = [
        makeMockRsvpEntry('1', 'Persona 1'),
        makeMockRsvpEntry('2', 'Persona 2'),
        makeMockRsvpEntry('3', 'Persona 3'),
      ];
      mockRsvpLogRepo.list.mockResolvedValue({ total: 12, items });

      component.ionViewWillEnter();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(mockRsvpLogRepo.list).toHaveBeenCalledWith('event-123', { limit: 3, offset: 0 });

      const itemElements = fixture.debugElement.queryAll(By.css('app-rsvp-log-item'));
      expect(itemElements).toHaveLength(3);

      const viewAllBtn = fixture.debugElement.query(
        By.css('.recent-rsvp-card ion-button[expand="block"]'),
      );
      expect(viewAllBtn).toBeTruthy();
      expect(viewAllBtn.nativeElement.textContent).toContain('Ver todas (12)');
      const routerLinkInstance = viewAllBtn.injector.get(RouterLink);
      expect(routerLinkInstance.urlTree?.toString()).toBe('/eventos/event-123/respuestas');
    });

    it('renders empty message when total === 0 and does not render "Ver todas"', async () => {
      mockRsvpLogRepo.list.mockResolvedValue({ total: 0, items: [] });

      component.ionViewWillEnter();
      await fixture.whenStable();
      fixture.detectChanges();

      const itemElements = fixture.debugElement.queryAll(By.css('app-rsvp-log-item'));
      expect(itemElements).toHaveLength(0);

      const emptyText = fixture.debugElement.query(By.css('.recent-rsvp-card p.text-body'));
      expect(emptyText?.nativeElement.textContent).toContain('Todavía nadie ha respondido.');

      const viewAllBtn = fixture.debugElement.query(
        By.css('.recent-rsvp-card ion-button[expand="block"]'),
      );
      expect(viewAllBtn).toBeNull();
    });

    it('displays error and "Reintentar" button without breaking the rest of dashboard when rsvp load fails', async () => {
      mockRsvpLogRepo.list.mockRejectedValue(new Error('Connection failed'));

      component.ionViewWillEnter();
      await fixture.whenStable();
      fixture.detectChanges();

      const errorText = fixture.debugElement.query(By.css('.recent-rsvp-card p.text-body'));
      expect(errorText?.nativeElement.textContent).toContain('No pudimos cargar las respuestas.');

      const retryBtn = fixture.debugElement.query(By.css('.recent-rsvp-card ion-button'));
      expect(retryBtn?.nativeElement.textContent).toContain('Reintentar');

      expect(fixture.nativeElement.textContent).toContain('Resumen de asistencia');
      expect(component.counts().total).toBe(40);

      mockRsvpLogRepo.list.mockResolvedValue({
        total: 1,
        items: [makeMockRsvpEntry('1', 'Persona 1')],
      });
      await component.retryRecentRsvp();
      fixture.detectChanges();

      expect(mockRsvpLogRepo.list).toHaveBeenCalledTimes(2);
      expect(component.recentRsvpEntries()).toHaveLength(1);
    });

    it('clears previous event recent rsvps when changing event on enter', () => {
      component.recentRsvpEntries.set([makeMockRsvpEntry('1', 'Persona 1')]);
      component.recentRsvpTotal.set(1);
      mockEventContext.event.set(mockEvent);

      fixture.componentRef.setInput('id', 'event-999');
      component.ionViewWillEnter();

      expect(component.recentRsvpEntries()).toEqual([]);
      expect(component.recentRsvpTotal()).toBe(0);
    });
  });

  describe('Gallery Card Section', () => {
    function getCardAriaLabel(cardEl: HTMLElement): string | null {
      return (
        cardEl.getAttribute('aria-label') ??
        cardEl.shadowRoot?.querySelector('.card-native')?.getAttribute('aria-label') ??
        null
      );
    }

    it('renders "Sin fotos todavía" and aria-label "Galería, sin fotos" when there are no photos', async () => {
      mockPhotosRepo.list.mockResolvedValue([]);

      component.ionViewWillEnter();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(mockPhotosRepo.list).toHaveBeenCalledWith('event-123');
      expect(component.photoCount()).toBe(0);
      expect(component.photoSummaryText()).toBe('Sin fotos todavía');
      expect(component.hasPhotos()).toBe(false);

      const linkElements = fixture.debugElement.queryAll(By.directive(RouterLink));
      const galleryCard = linkElements.find((el) =>
        el.nativeElement.textContent?.includes('Galería'),
      );
      expect(galleryCard).toBeTruthy();

      const routerLinkInstance = galleryCard?.injector.get(RouterLink);
      expect(routerLinkInstance?.urlTree?.toString()).toBe('/eventos/event-123/galeria');

      const cardNative = galleryCard?.nativeElement as HTMLElement;
      expect(getCardAriaLabel(cardNative)).toBe('Galería, sin fotos');
      expect(cardNative.textContent).toContain('Sin fotos todavía');

      const parentCol = cardNative.closest('ion-col');
      expect(parentCol?.getAttribute('size')).toBe('6');
    });

    it('renders "5 fotos", 3 thumbnails and "Ver ›" when there are 5 photos', async () => {
      const photos = [
        makeMockPhoto('1'),
        makeMockPhoto('2'),
        makeMockPhoto('3'),
        makeMockPhoto('4'),
        makeMockPhoto('5'),
      ];
      mockPhotosRepo.list.mockResolvedValue(photos);

      component.ionViewWillEnter();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.photoCount()).toBe(5);
      expect(component.photoSummaryText()).toBe('5 fotos');
      expect(component.hasPhotos()).toBe(true);

      const linkElements = fixture.debugElement.queryAll(By.directive(RouterLink));
      const galleryCard = linkElements.find((el) =>
        el.nativeElement.textContent?.includes('Galería'),
      );
      expect(galleryCard).toBeTruthy();

      const cardNative = galleryCard?.nativeElement as HTMLElement;
      expect(getCardAriaLabel(cardNative)).toBe('Galería, 5 fotos');
      expect(cardNative.textContent).toContain('5 fotos');
      expect(cardNative.textContent).toContain('Ver ›');

      const parentCol = cardNative.closest('ion-col');
      expect(parentCol?.getAttribute('size')).toBe('12');

      expect(mockPhotoCache.getUrl).toHaveBeenCalledTimes(3);
      expect(mockPhotoCache.getUrl).toHaveBeenCalledWith('event-123/1_thumb.jpg');
      expect(mockPhotoCache.getUrl).toHaveBeenCalledWith('event-123/2_thumb.jpg');
      expect(mockPhotoCache.getUrl).toHaveBeenCalledWith('event-123/3_thumb.jpg');

      const thumbImgs = fixture.debugElement.queryAll(By.css('.access-card__gallery-thumb'));
      expect(thumbImgs).toHaveLength(3);
      for (const img of thumbImgs) {
        expect(img.nativeElement.getAttribute('alt')).toBe('');
      }
    });

    it('renders "1 foto" and 1 thumbnail when there is 1 photo', async () => {
      mockPhotosRepo.list.mockResolvedValue([makeMockPhoto('1')]);

      component.ionViewWillEnter();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.photoCount()).toBe(1);
      expect(component.photoSummaryText()).toBe('1 foto');
      expect(component.hasPhotos()).toBe(true);

      const linkElements = fixture.debugElement.queryAll(By.directive(RouterLink));
      const galleryCard = linkElements.find((el) =>
        el.nativeElement.textContent?.includes('Galería'),
      );
      expect(galleryCard).toBeTruthy();

      const cardNative = galleryCard?.nativeElement as HTMLElement;
      expect(getCardAriaLabel(cardNative)).toBe('Galería, 1 foto');
      expect(cardNative.textContent).toContain('1 foto');

      const thumbImgs = fixture.debugElement.queryAll(By.css('.access-card__gallery-thumb'));
      expect(thumbImgs).toHaveLength(1);
    });

    it('renders Galería card for owner in access-grid and for helper in helper-actions', async () => {
      mockEventContext.isOwner.set(true);
      mockPhotosRepo.list.mockResolvedValue([makeMockPhoto('1')]);
      component.ionViewWillEnter();
      await fixture.whenStable();
      fixture.detectChanges();

      const ownerGrid = fixture.debugElement.query(By.css('.access-grid'));
      const ownerCard = ownerGrid.query(By.css('.access-card--gallery-wide'));
      expect(ownerCard).toBeTruthy();

      mockEventContext.isOwner.set(false);
      component.ionViewWillEnter();
      await fixture.whenStable();
      fixture.detectChanges();

      const helperActions = fixture.debugElement.query(By.css('.helper-actions'));
      const helperWideCard = helperActions.query(By.css('.access-card--gallery-wide'));
      expect(helperWideCard).toBeTruthy();

      mockPhotosRepo.list.mockResolvedValue([]);
      component.ionViewWillEnter();
      await fixture.whenStable();
      fixture.detectChanges();

      const helperRowCard = helperActions.query(By.css('.helper-actions__gallery-card'));
      expect(helperRowCard).toBeTruthy();
      expect(helperRowCard.nativeElement.textContent).toContain('Sin fotos todavía');
    });

    it('renders skeleton while thumbnail is loading and updates to image when resolved', async () => {
      let resolveUrl: (url: string) => void = () => {};
      mockPhotoCache.getUrl.mockReturnValue(
        new Promise<string>((resolve) => {
          resolveUrl = resolve;
        }),
      );
      mockPhotosRepo.list.mockResolvedValue([makeMockPhoto('1')]);

      component.ionViewWillEnter();
      await fixture.whenStable();
      fixture.detectChanges();

      const skeleton = fixture.debugElement.query(By.css('.access-card__gallery-skeleton'));
      expect(skeleton).toBeTruthy();

      resolveUrl('blob:event-123/1_thumb.jpg');
      await fixture.whenStable();
      fixture.detectChanges();

      const img = fixture.debugElement.query(By.css('.access-card__gallery-thumb'));
      expect(img).toBeTruthy();
      expect(img.nativeElement.getAttribute('src')).toBe('blob:event-123/1_thumb.jpg');
    });

    it('renders card with title only and without toast when PhotosRepository.list fails, keeping rest of dashboard loaded', async () => {
      mockPhotosRepo.list.mockRejectedValue(new Error('Connection error'));
      const toastCtrl = TestBed.inject(ToastController);
      const toastSpy = vi.spyOn(toastCtrl, 'create');

      component.ionViewWillEnter();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(mockPhotosRepo.list).toHaveBeenCalledWith('event-123');
      expect(component.photoCount()).toBeNull();
      expect(component.photoSummaryText()).toBeNull();
      expect(toastSpy).not.toHaveBeenCalled();

      expect(component.counts().total).toBe(40);
      expect(fixture.nativeElement.textContent).toContain('Resumen de asistencia');

      const linkElements = fixture.debugElement.queryAll(By.directive(RouterLink));
      const galleryCard = linkElements.find((el) =>
        el.nativeElement.textContent?.includes('Galería'),
      );
      expect(galleryCard).toBeTruthy();
      expect(galleryCard?.nativeElement.querySelector('.access-card__summary')).toBeNull();
      expect(getCardAriaLabel(galleryCard?.nativeElement as HTMLElement)).toBe('Galería, sin fotos');
    });

    it('resets photoCount, recentPhotos and thumbnailUrls when changing event on enter', () => {
      component.photoCount.set(10);
      component.recentPhotos.set([makeMockPhoto('1')]);
      component.thumbnailUrls.set({ 'event-123/1_thumb.jpg': 'blob:thumb-1' });
      mockEventContext.event.set(mockEvent);

      fixture.componentRef.setInput('id', 'event-999');
      component.ionViewWillEnter();

      expect(component.photoCount()).toBeNull();
      expect(component.recentPhotos()).toEqual([]);
      expect(component.thumbnailUrls()).toEqual({});
    });
  });
});
