import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import {
  ActionSheetController,
  AlertController,
  ModalController,
  ToastController,
} from '@ionic/angular';
import {
  EventContextService,
  EventRole,
  EventRow,
  GiftWithReservations,
  GiftsRepository,
  RealtimeService,
} from '../../../core';
import { GiftFormComponent } from '../formulario/gift-form.component';
import { GiftListPage } from './gift-list.page';

describe('GiftListPage', () => {
  beforeAll(() => {
    if (!Element.prototype.scrollTo) {
      Element.prototype.scrollTo = vi.fn();
    }
  });

  let fixture: ComponentFixture<GiftListPage>;
  let component: GiftListPage;
  let mockModalCtrl: { create: ReturnType<typeof vi.fn> };
  let mockModal: {
    present: ReturnType<typeof vi.fn>;
    onWillDismiss: ReturnType<typeof vi.fn>;
    onDidDismiss: ReturnType<typeof vi.fn>;
  };
  let mockEventContext: {
    event: ReturnType<typeof signal<EventRow | null>>;
    role: ReturnType<typeof signal<EventRole | null>>;
    isOwner: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    loading: ReturnType<typeof signal<boolean>>;
    load: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
  let mockGiftsRepo: {
    list: ReturnType<typeof vi.fn>;
    addSuggested: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    releaseReservation: ReturnType<typeof vi.fn>;
  };
  let mockRealtime: {
    watch: ReturnType<typeof vi.fn>;
  };
  let mockAlertCtrl: { create: ReturnType<typeof vi.fn> };
  let mockActionSheetCtrl: { create: ReturnType<typeof vi.fn> };
  let mockToastCtrl: { create: ReturnType<typeof vi.fn> };

  const mockRepeatable: GiftWithReservations = {
    id: 'gift-rep',
    event_id: 'evt-123',
    name: 'Pañales',
    description: 'Etapa 1',
    category: 'Higiene',
    kind: 'repeatable',
    max_reservations: 5,
    sort_order: 1,
    created_at: '2026-10-25T00:00:00Z',
    reservations: [
      { id: 'res-1', created_at: '2026-10-25T01:00:00Z' },
      { id: 'res-2', created_at: '2026-10-25T02:00:00Z' },
    ],
  };

  const mockFree: GiftWithReservations = {
    id: 'gift-free',
    event_id: 'evt-123',
    name: 'Regalo libre',
    description: 'A elección',
    category: null,
    kind: 'free',
    max_reservations: null,
    sort_order: 2,
    created_at: '2026-10-25T00:00:00Z',
    reservations: [{ id: 'res-free-1', created_at: '2026-10-25T02:30:00Z' }],
  };

  const mockUnique: GiftWithReservations = {
    id: 'gift-uniq',
    event_id: 'evt-123',
    name: 'Coche paseador',
    description: 'Color gris',
    category: 'Paseo',
    kind: 'unique',
    max_reservations: null,
    sort_order: 3,
    created_at: '2026-10-25T00:00:00Z',
    reservations: [{ id: 'res-3', created_at: '2026-10-25T03:00:00Z' }],
  };

  const mockSuggestion: GiftWithReservations = {
    id: 'gift-sug',
    event_id: 'evt-123',
    name: 'Lluvia de sobres',
    description: 'Para ahorrar para el bebé',
    category: null,
    kind: 'suggestion',
    max_reservations: null,
    sort_order: 4,
    created_at: '2026-10-25T00:00:00Z',
    reservations: [],
  };

  beforeEach(async () => {
    mockModal = {
      present: vi.fn().mockResolvedValue(undefined),
      onWillDismiss: vi.fn().mockResolvedValue({ role: 'backdrop' }),
      onDidDismiss: vi.fn().mockResolvedValue({ role: 'backdrop' }),
    };
    mockModalCtrl = {
      create: vi.fn().mockResolvedValue(mockModal),
    };
    mockEventContext = {
      event: signal(null),
      role: signal('owner'),
      isOwner: signal(true),
      error: signal(null),
      loading: signal(false),
      load: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn(),
    };
    mockGiftsRepo = {
      list: vi.fn().mockResolvedValue([]),
      addSuggested: vi.fn().mockResolvedValue(0),
      remove: vi.fn().mockResolvedValue(undefined),
      releaseReservation: vi.fn().mockResolvedValue(undefined),
    };
    mockRealtime = {
      watch: vi.fn().mockReturnValue(() => {}),
    };
    mockAlertCtrl = {
      create: vi.fn(),
    };
    mockActionSheetCtrl = {
      create: vi.fn(),
    };
    mockToastCtrl = {
      create: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [GiftListPage],
      providers: [
        provideRouter([]),
        { provide: ModalController, useValue: mockModalCtrl },
        { provide: EventContextService, useValue: mockEventContext },
        { provide: GiftsRepository, useValue: mockGiftsRepo },
        { provide: RealtimeService, useValue: mockRealtime },
        { provide: AlertController, useValue: mockAlertCtrl },
        { provide: ActionSheetController, useValue: mockActionSheetCtrl },
        { provide: ToastController, useValue: mockToastCtrl },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GiftListPage);
    fixture.componentRef.setInput('id', 'evt-123');
    component = fixture.componentInstance;
  });

  it('configures openForm sheet with expandToScroll: false', async () => {
    await component.openForm();

    expect(mockModalCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        component: GiftFormComponent,
        componentProps: {
          eventId: 'evt-123',
          gift: null,
          hasFreeGift: false,
        },
        breakpoints: [0, 0.9, 1],
        initialBreakpoint: 0.9,
        expandToScroll: false,
      }),
    );
  });

  it('renders "Nuevo regalo" button and clicking it calls ModalController.create with GiftFormComponent', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const buttons = fixture.debugElement.queryAll(By.css('ion-button'));
    const newGiftBtn = buttons.find((btn) =>
      btn.nativeElement.textContent?.includes('Nuevo regalo'),
    );
    expect(newGiftBtn).toBeTruthy();

    newGiftBtn?.nativeElement.click();

    expect(mockModalCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        component: GiftFormComponent,
        expandToScroll: false,
      }),
    );
  });

  describe('familyCountLabel', () => {
    it('formats count without max limit', () => {
      expect(component.familyCountLabel(0, null)).toBe('Ninguna familia todavía');
      expect(component.familyCountLabel(1, null)).toBe('1 familia');
      expect(component.familyCountLabel(3, null)).toBe('3 familias');
    });

    it('formats count with max limit including 6 de 10 familias and 0 de 1 familia', () => {
      expect(component.familyCountLabel(6, 10)).toBe('6 de 10 familias');
      expect(component.familyCountLabel(0, 1)).toBe('0 de 1 familia');
      expect(component.familyCountLabel(1, 1)).toBe('1 de 1 familia');
    });
  });

  describe('anonymity in list', () => {
    beforeEach(async () => {
      mockGiftsRepo.list.mockResolvedValue([mockRepeatable, mockUnique]);
      await component.ionViewWillEnter();
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('renders anonymity note in top bar', () => {
      const note = fixture.debugElement.query(By.css('.anonymity-note'));
      expect(note).toBeTruthy();
      expect(note.nativeElement.textContent).toContain(
        'Las reservas son anónimas: aquí solo ves cuántas familias eligieron cada regalo.',
      );
    });

    it('does not contain family names or "Ver familias" in component text', () => {
      const text = fixture.nativeElement.textContent;
      expect(text).not.toContain('Familia');
      expect(text).not.toContain('Ver familias');
    });

    it('does not render any ion-accordion element', () => {
      const accordion = fixture.debugElement.query(By.css('ion-accordion'));
      const accordionGroup = fixture.debugElement.query(By.css('ion-accordion-group'));
      expect(accordion).toBeNull();
      expect(accordionGroup).toBeNull();
    });

    it('displays "Apartado" on reserved unique gift badge', () => {
      const badge = fixture.debugElement.query(By.css('.unique-status-row .badge-soft-success'));
      expect(badge).toBeTruthy();
      expect(badge.nativeElement.textContent.trim()).toBe('Apartado');
    });

    it('opens confirmation alert with new message on confirmRelease', async () => {
      mockAlertCtrl.create.mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
      });

      await component.confirmRelease(mockUnique, mockUnique.reservations[0]);

      expect(mockAlertCtrl.create).toHaveBeenCalledWith(
        expect.objectContaining({
          header: 'Liberar reserva',
          message: '¿Liberar Coche paseador? Volverá a quedar disponible en la lista.',
        }),
      );
    });
  });

  describe('sections and filters', () => {
    beforeEach(async () => {
      mockGiftsRepo.list.mockResolvedValue([
        mockRepeatable,
        mockFree,
        mockUnique,
        mockSuggestion,
      ]);
      await component.ionViewWillEnter();
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('"Todos" muestra las cuatro secciones en el orden indicado: Repetibles, Libre, Únicos, Sugerencias', () => {
      component.filter.set('all');
      fixture.detectChanges();

      const headings = fixture.debugElement
        .queryAll(By.css('.section-heading'))
        .map((h) => h.nativeElement.textContent.trim());

      expect(headings).toEqual([
        'Regalos repetibles',
        'Regalo libre',
        'Regalos únicos',
        'Sugerencias',
      ]);
    });

    it('el filtro Sugerencias muestra solo sugerencias con "Sugerencia" y sin conteo', () => {
      component.filter.set('suggestion');
      fixture.detectChanges();

      const headings = fixture.debugElement
        .queryAll(By.css('.section-heading'))
        .map((h) => h.nativeElement.textContent.trim());

      expect(headings).toEqual(['Sugerencias']);

      const suggestionSection = fixture.debugElement.query(By.css('.gift-section'));
      expect(suggestionSection).not.toBeNull();

      // Muestra la card con el badge "Sugerencia" y el texto de ayuda
      const badge = suggestionSection.query(By.css('.badge-soft-medium'));
      expect(badge).not.toBeNull();
      expect(badge.nativeElement.textContent.trim()).toBe('Sugerencia');

      const hint = suggestionSection.query(By.css('.gift-card__hint'));
      expect(hint).not.toBeNull();
      expect(hint.nativeElement.textContent.trim()).toBe(
        'Los invitados la ven como idea; no se reserva.',
      );

      // Sin conteo de familias
      expect(suggestionSection.nativeElement.textContent).not.toContain('familias');
      expect(suggestionSection.nativeElement.textContent).not.toContain('familia');
    });

    it('el filtro Repetibles muestra repetibles y libre', () => {
      component.filter.set('repeatable');
      fixture.detectChanges();

      const headings = fixture.debugElement
        .queryAll(By.css('.section-heading'))
        .map((h) => h.nativeElement.textContent.trim());

      expect(headings).toEqual(['Regalos repetibles', 'Regalo libre']);
    });

    it('onFilterChange actualiza el filtro a valores válidos', () => {
      component.onFilterChange(new CustomEvent('ionChange', { detail: { value: 'suggestion' } }));
      expect(component.filter()).toBe('suggestion');

      component.onFilterChange(new CustomEvent('ionChange', { detail: { value: 'repeatable' } }));
      expect(component.filter()).toBe('repeatable');

      component.onFilterChange(new CustomEvent('ionChange', { detail: { value: 'unique' } }));
      expect(component.filter()).toBe('unique');

      component.onFilterChange(new CustomEvent('ionChange', { detail: { value: 'all' } }));
      expect(component.filter()).toBe('all');
    });
  });
});
