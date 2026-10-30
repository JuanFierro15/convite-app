import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { RouterLink, provideRouter } from '@angular/router';
import {
  ArrivalSessionService,
  EventAttendance,
  EventContextService,
  EventRow,
  EventsRepository,
  RealtimeService,
} from '../../../core';
import { EventDashboardPage } from './event-dashboard.page';

const mockEvent: EventRow = {
  id: 'event-123',
  created_by: 'owner-1',
  name: 'Baby Shower Neiva',
  theme_id: 'baby-shower',
  starts_at: '2026-11-29T15:00:00-05:00',
  venue_name: 'Salón Comunitario',
  venue_address: 'Calle 10 # 5-20',
  city: 'Neiva',
  map_url: null,
  welcome_message: null,
  rsvp_deadline: '2026-11-15T23:59:59-05:00',
  budget_cop: null,
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
  let mockArrivalSession: {
    prefetch: ReturnType<typeof vi.fn>;
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
    mockArrivalSession = {
      prefetch: vi.fn().mockResolvedValue(undefined),
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
});
