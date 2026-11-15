import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AlertController, ModalController, ToastController } from '@ionic/angular';
import {
  EventContextService,
  EventRow,
  EventsRepository,
  InvitationBatchRow,
  InvitationBatchesRepository,
  ThemeService,
  formatDayMonth,
  sortBatches,
} from '../../../core';
import { BatchFormComponent } from './batch-form.component';
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
  team_id: null,
  created_at: '2026-10-01T00:00:00-05:00',
  updated_at: '2026-10-01T00:00:00-05:00',
};

const sampleBatches: InvitationBatchRow[] = [
  {
    id: 'batch-2',
    event_id: 'event-123',
    name: 'Segunda tanda',
    rsvp_deadline: '2026-11-20T23:59:59-05:00',
    created_at: '2026-10-02T00:00:00-05:00',
  },
  {
    id: 'batch-3',
    event_id: 'event-123',
    name: 'Tercera tanda',
    rsvp_deadline: '2026-11-24T23:59:59-05:00',
    created_at: '2026-10-03T00:00:00-05:00',
  },
  {
    id: 'batch-4',
    event_id: 'event-123',
    name: 'Última tanda',
    rsvp_deadline: '2026-11-27T23:59:59-05:00',
    created_at: '2026-10-04T00:00:00-05:00',
  },
];

describe('EventFormPage', () => {
  let fixture: ComponentFixture<EventFormPage>;
  let component: EventFormPage;
  let mockEventContext: {
    event: ReturnType<typeof signal<EventRow | null>>;
    role: ReturnType<typeof signal<'owner' | 'helper' | null>>;
    batches: ReturnType<typeof signal<InvitationBatchRow[]>>;
    error: ReturnType<typeof signal<string | null>>;
    load: ReturnType<typeof vi.fn>;
    setBatches: ReturnType<typeof vi.fn>;
  };
  let mockEventsRepo: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let mockBatchesRepo: {
    remove: ReturnType<typeof vi.fn>;
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
  let mockToastPresent: ReturnType<typeof vi.fn>;
  let router: Router;

  beforeEach(async () => {
    document.documentElement.removeAttribute('data-theme');

    mockEventContext = {
      event: signal<EventRow | null>(null),
      role: signal<'owner' | 'helper' | null>(null),
      batches: signal<InvitationBatchRow[]>([]),
      error: signal<string | null>(null),
      load: vi.fn().mockResolvedValue(undefined),
      setBatches: vi.fn((rows: readonly InvitationBatchRow[]) => {
        mockEventContext.batches.set(sortBatches(rows));
      }),
    };

    mockEventsRepo = {
      create: vi.fn().mockResolvedValue({ ...mockEvent, id: 'event-new' }),
      update: vi.fn().mockResolvedValue(mockEvent),
    };

    mockBatchesRepo = {
      remove: vi.fn().mockResolvedValue(undefined),
    };

    mockModalCtrl = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
        onWillDismiss: vi.fn().mockResolvedValue({ role: 'cancel', data: null }),
      }),
    };

    mockAlertCtrl = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
        onDidDismiss: vi.fn().mockResolvedValue({ role: 'cancel' }),
      }),
    };

    mockToastPresent = vi.fn().mockResolvedValue(undefined);
    mockToastCtrl = {
      create: vi.fn().mockResolvedValue({
        present: mockToastPresent,
      }),
    };

    await TestBed.configureTestingModule({
      imports: [EventFormPage],
      providers: [
        provideRouter([]),
        ThemeService,
        { provide: EventContextService, useValue: mockEventContext },
        { provide: EventsRepository, useValue: mockEventsRepo },
        { provide: InvitationBatchesRepository, useValue: mockBatchesRepo },
        { provide: ModalController, useValue: mockModalCtrl },
        { provide: AlertController, useValue: mockAlertCtrl },
        { provide: ToastController, useValue: mockToastCtrl },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(EventFormPage);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  async function enterEditMode(batches: InvitationBatchRow[] = []): Promise<void> {
    mockEventContext.event.set(mockEvent);
    mockEventContext.role.set('owner');
    mockEventContext.batches.set(batches);

    fixture.componentRef.setInput('id', 'event-123');
    component.ionViewWillEnter();
    await vi.waitFor(() =>
      expect(component.form.controls.name.value).toBe('Baby Shower Neiva'),
    );
    fixture.detectChanges();
  }

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

  it('no muestra la sección de tandas en Nuevo evento y sí en edición con Primera tanda', async () => {
    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    const rootCreate = fixture.nativeElement as HTMLElement;
    expect(rootCreate.querySelector('.batches-card')).toBeNull();
    expect(rootCreate.textContent).not.toContain('Tandas de invitaciones');

    await enterEditMode([]);
    const rootEdit = fixture.nativeElement as HTMLElement;
    const batchesSection = rootEdit.querySelector('.batches-card');
    expect(batchesSection).not.toBeNull();
    expect(batchesSection?.textContent).toContain('Tandas de invitaciones');
    expect(batchesSection?.textContent).toContain(
      'Cada tanda tiene su propia fecha límite. Las invitaciones nuevas quedan en la tanda más reciente.',
    );

    const rows = batchesSection?.querySelectorAll('.batch-row') ?? [];
    expect(rows.length).toBe(1);
    expect(rows[0].querySelector('.batch-row__name')?.textContent?.trim()).toBe('Primera tanda');
    expect(rows[0].querySelector('.batch-row__date')?.textContent?.trim()).toBe(
      formatDayMonth(mockEvent.rsvp_deadline),
    );
    expect(rows[0].querySelectorAll('ion-button').length).toBe(0);
  });

  it('un doble toque en Agregar tanda abre un solo modal', async () => {
    await enterEditMode([]);
    await Promise.all([component.openBatchModal(), component.openBatchModal()]);
    expect(mockModalCtrl.create).toHaveBeenCalledTimes(1);

    await component.openBatchModal();
    expect(mockModalCtrl.create).toHaveBeenCalledTimes(2);
  });

  it('muestra filas en orden con 0, 1 y 3 tandas y abre el modal para editar la segunda y la última', async () => {
    await enterEditMode([]);
    let rows = (fixture.nativeElement as HTMLElement).querySelectorAll('.batch-row');
    expect(rows.length).toBe(1);

    mockEventContext.batches.set([sampleBatches[0]]);
    fixture.detectChanges();
    rows = (fixture.nativeElement as HTMLElement).querySelectorAll('.batch-row');
    expect(rows.length).toBe(2);
    expect(rows[1].querySelector('.batch-row__name')?.textContent?.trim()).toBe('Segunda tanda');

    mockEventContext.batches.set(sampleBatches);
    fixture.detectChanges();
    rows = (fixture.nativeElement as HTMLElement).querySelectorAll('.batch-row');
    expect(rows.length).toBe(4);
    expect(
      Array.from(rows).map((row) => row.querySelector('.batch-row__name')?.textContent?.trim()),
    ).toEqual(['Primera tanda', 'Segunda tanda', 'Tercera tanda', 'Última tanda']);
    expect(
      Array.from(rows).map((row) => row.querySelector('.batch-row__date')?.textContent?.trim()),
    ).toEqual([
      formatDayMonth(mockEvent.rsvp_deadline),
      formatDayMonth(sampleBatches[0].rsvp_deadline),
      formatDayMonth(sampleBatches[1].rsvp_deadline),
      formatDayMonth(sampleBatches[2].rsvp_deadline),
    ]);

    const getAriaLabel = (btn: Element | null | undefined): string | null =>
      btn?.getAttribute('aria-label') ??
      btn?.shadowRoot?.querySelector('button')?.getAttribute('aria-label') ??
      null;

    const editSecondBtn = rows[2].querySelector('.batch-row__action-btn') as HTMLButtonElement;
    expect(getAriaLabel(editSecondBtn)).toBe('Editar tanda Tercera tanda');
    editSecondBtn.click();
    await fixture.whenStable();

    expect(mockModalCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        component: BatchFormComponent,
        componentProps: expect.objectContaining({
          eventId: 'event-123',
          batch: sampleBatches[1],
          eventStartsAt: mockEvent.starts_at,
        }),
      }),
    );

    const editLastBtn = rows[3].querySelector('.batch-row__action-btn') as HTMLButtonElement;
    expect(getAriaLabel(editLastBtn)).toBe('Editar tanda Última tanda');
    editLastBtn.click();
    await fixture.whenStable();

    expect(mockModalCtrl.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        component: BatchFormComponent,
        componentProps: expect.objectContaining({
          eventId: 'event-123',
          batch: sampleBatches[2],
          eventStartsAt: mockEvent.starts_at,
        }),
      }),
    );
  });

  it('agrega y reemplaza tandas al volver del modal con saved sin marcar el formulario como modificado', async () => {
    await enterEditMode([sampleBatches[0]]);
    const loadCallsAfterEnter = mockEventContext.load.mock.calls.length;

    const createdBatch: InvitationBatchRow = {
      id: 'batch-new',
      event_id: 'event-123',
      name: 'Tercera tanda',
      rsvp_deadline: '2026-11-25T23:59:59-05:00',
      created_at: '2026-10-05T00:00:00-05:00',
    };
    mockModalCtrl.create.mockResolvedValueOnce({
      present: vi.fn().mockResolvedValue(undefined),
      onWillDismiss: vi.fn().mockResolvedValue({ role: 'saved', data: createdBatch }),
    });

    await component.openBatchModal();

    expect(mockEventContext.setBatches).toHaveBeenCalledWith([sampleBatches[0], createdBatch]);
    expect(mockEventContext.batches().map((b) => b.id)).toEqual(['batch-2', 'batch-new']);
    expect(mockEventContext.load).toHaveBeenCalledTimes(loadCallsAfterEnter);
    expect(component.form.dirty).toBe(false);

    const updatedBatch: InvitationBatchRow = {
      ...createdBatch,
      name: 'Tanda final',
    };
    mockModalCtrl.create.mockResolvedValueOnce({
      present: vi.fn().mockResolvedValue(undefined),
      onWillDismiss: vi.fn().mockResolvedValue({ role: 'saved', data: updatedBatch }),
    });

    await component.openBatchModal(createdBatch);

    expect(mockEventContext.batches().map((b) => b.name)).toEqual([
      'Segunda tanda',
      'Tanda final',
    ]);
    expect(component.form.dirty).toBe(false);
  });

  it('cancelar borrado no llama al repositorio y deja las tandas intactas', async () => {
    await enterEditMode(sampleBatches);
    mockAlertCtrl.create.mockResolvedValueOnce({
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockResolvedValue({ role: 'cancel' }),
    });

    await component.confirmDeleteBatch(sampleBatches[1]);

    expect(mockAlertCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        header: '¿Borrar la tanda Tercera tanda?',
        message: 'Solo se puede borrar si no tiene invitaciones.',
        buttons: expect.arrayContaining([
          expect.objectContaining({ text: 'Cancelar', role: 'cancel' }),
          expect.objectContaining({ text: 'Borrar', role: 'destructive' }),
        ]),
      }),
    );
    expect(mockBatchesRepo.remove).not.toHaveBeenCalled();
    expect(mockEventContext.batches().length).toBe(3);
  });

  it('muestra toast exacto y mantiene la fila si falla el borrado de una tanda', async () => {
    await enterEditMode(sampleBatches);
    mockAlertCtrl.create.mockResolvedValueOnce({
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockResolvedValue({ role: 'destructive' }),
    });
    mockBatchesRepo.remove.mockRejectedValueOnce(
      new Error('Esta tanda tiene invitaciones. Muévelas a otra tanda antes de borrarla.'),
    );

    await component.confirmDeleteBatch(sampleBatches[2]);

    expect(mockBatchesRepo.remove).toHaveBeenCalledWith('batch-4');
    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Esta tanda tiene invitaciones. Muévelas a otra tanda antes de borrarla.',
        color: 'danger',
      }),
    );
    expect(mockToastPresent).toHaveBeenCalled();
    expect(mockEventContext.batches().map((b) => b.id)).toEqual([
      'batch-2',
      'batch-3',
      'batch-4',
    ]);
  });

  it('quita la fila de eventContext cuando el borrado tiene éxito sin marcar el formulario', async () => {
    await enterEditMode(sampleBatches);
    mockAlertCtrl.create.mockResolvedValueOnce({
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockResolvedValue({ role: 'destructive' }),
    });

    await component.confirmDeleteBatch(sampleBatches[1]);

    expect(mockBatchesRepo.remove).toHaveBeenCalledWith('batch-3');
    expect(mockEventContext.setBatches).toHaveBeenCalledWith([
      sampleBatches[0],
      sampleBatches[2],
    ]);
    expect(mockEventContext.batches().map((b) => b.id)).toEqual(['batch-2', 'batch-4']);
    expect(component.form.dirty).toBe(false);
  });

  it('muestra en toast el error del servidor si una tanda queda posterior a la nueva fecha del evento', async () => {
    await enterEditMode(sampleBatches);
    mockEventsRepo.update.mockRejectedValueOnce(
      new Error('La fecha límite de cada tanda debe ser anterior o igual a la fecha del evento.'),
    );

    component.form.patchValue({
      starts_at: '2026-11-22T15:00',
      rsvp_deadline: '2026-11-15',
    });
    await component.onSubmit();

    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'La fecha límite de cada tanda debe ser anterior o igual a la fecha del evento.',
        color: 'danger',
      }),
    );
    expect(mockToastPresent).toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
