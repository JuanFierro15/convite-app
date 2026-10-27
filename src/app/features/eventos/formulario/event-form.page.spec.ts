import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ToastController } from '@ionic/angular';
import {
  EventContextService,
  EventRow,
  EventsRepository,
  ThemeService,
} from '../../../core';
import { EventFormPage } from './event-form.page';

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

describe('EventFormPage', () => {
  let fixture: ComponentFixture<EventFormPage>;
  let component: EventFormPage;
  let mockEventContext: {
    event: ReturnType<typeof signal<EventRow | null>>;
    role: ReturnType<typeof signal<'owner' | 'helper' | null>>;
    error: ReturnType<typeof signal<string | null>>;
    load: ReturnType<typeof vi.fn>;
  };
  let mockEventsRepo: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let mockToastCtrl: {
    create: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    document.documentElement.removeAttribute('data-theme');

    mockEventContext = {
      event: signal<EventRow | null>(null),
      role: signal<'owner' | 'helper' | null>(null),
      error: signal<string | null>(null),
      load: vi.fn().mockResolvedValue(undefined),
    };

    mockEventsRepo = {
      create: vi.fn().mockResolvedValue({ ...mockEvent, id: 'event-new' }),
      update: vi.fn().mockResolvedValue(mockEvent),
    };

    mockToastCtrl = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
      }),
    };

    await TestBed.configureTestingModule({
      imports: [EventFormPage],
      providers: [
        provideRouter([]),
        ThemeService,
        { provide: EventContextService, useValue: mockEventContext },
        { provide: EventsRepository, useValue: mockEventsRepo },
        { provide: ToastController, useValue: mockToastCtrl },
      ],
    }).compileComponents();

    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(EventFormPage);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('shows 2 theme cards with baby-shower selected when creating an event', async () => {
    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    const cards = fixture.nativeElement.querySelectorAll(
      '.theme-card',
    ) as NodeListOf<HTMLButtonElement>;
    expect(cards.length).toBe(2);

    const labels = Array.from(cards).map(
      (c) => c.querySelector('.theme-card__name')?.textContent?.trim(),
    );
    expect(labels).toEqual(['Jardín de algodón', 'Miel y flores silvestres']);

    const selectedCard = fixture.nativeElement.querySelector(
      '.theme-card--selected',
    ) as HTMLButtonElement | null;
    expect(selectedCard?.getAttribute('data-theme')).toBe('baby-shower');
  });

  it('updates theme in form, sets document data-theme, and submits payload with selected theme', async () => {
    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    const honeyBeeCard = fixture.nativeElement.querySelector(
      '.theme-card[data-theme="honey-bee"]',
    ) as HTMLButtonElement;
    honeyBeeCard.click();
    fixture.detectChanges();

    expect(component.form.controls.theme_id.value).toBe('honey-bee');
    expect(document.documentElement.getAttribute('data-theme')).toBe('honey-bee');

    component.form.patchValue({
      name: 'Evento Ejemplo',
      starts_at: '2026-11-29T15:00',
      rsvp_deadline: '2026-11-20',
    });
    await component.onSubmit();

    expect(mockEventsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ theme_id: 'honey-bee' }),
    );
  });

  it('shows 3 theme cards with bautizo selected when editing an event with bautizo theme', async () => {
    mockEventContext.event.set({ ...mockEvent, theme_id: 'bautizo' });
    mockEventContext.role.set('owner');

    fixture.componentRef.setInput('id', 'event-123');
    component.ionViewWillEnter();
    await vi.waitFor(() =>
      expect(component.form.controls.theme_id.value).toBe('bautizo'),
    );
    fixture.detectChanges();

    const cards = fixture.nativeElement.querySelectorAll(
      '.theme-card',
    ) as NodeListOf<HTMLButtonElement>;
    expect(cards.length).toBe(3);

    const selectedCard = fixture.nativeElement.querySelector(
      '.theme-card--selected',
    ) as HTMLButtonElement | null;
    expect(selectedCard?.getAttribute('data-theme')).toBe('bautizo');
  });

  it('shows 2 theme cards with honey-bee selected when editing an event with honey-bee theme', async () => {
    mockEventContext.event.set({ ...mockEvent, theme_id: 'honey-bee' });
    mockEventContext.role.set('owner');

    fixture.componentRef.setInput('id', 'event-123');
    component.ionViewWillEnter();
    await vi.waitFor(() =>
      expect(component.form.controls.theme_id.value).toBe('honey-bee'),
    );
    fixture.detectChanges();

    const cards = fixture.nativeElement.querySelectorAll(
      '.theme-card',
    ) as NodeListOf<HTMLButtonElement>;
    expect(cards.length).toBe(2);

    const selectedCard = fixture.nativeElement.querySelector(
      '.theme-card--selected',
    ) as HTMLButtonElement | null;
    expect(selectedCard?.getAttribute('data-theme')).toBe('honey-bee');
  });
});
