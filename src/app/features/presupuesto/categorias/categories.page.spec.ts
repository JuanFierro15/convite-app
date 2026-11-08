import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import {
  BudgetRepository,
  EventContextService,
  EventRole,
  EventRow,
  ExpenseCategoryRow,
} from '../../../core';
import { CategoriesPage } from './categories.page';

describe('CategoriesPage', () => {
  let fixture: ComponentFixture<CategoriesPage>;
  let component: CategoriesPage;
  let router: Router;

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
    listCategories: ReturnType<typeof vi.fn>;
    createCategory: ReturnType<typeof vi.fn>;
    renameCategory: ReturnType<typeof vi.fn>;
    removeCategory: ReturnType<typeof vi.fn>;
    swapCategoryOrder: ReturnType<typeof vi.fn>;
    addSuggestedCategories: ReturnType<typeof vi.fn>;
  };

  let mockAlertCtrl: {
    create: ReturnType<typeof vi.fn>;
  };

  let mockToastCtrl: {
    create: ReturnType<typeof vi.fn>;
  };

  const sampleCategories: ExpenseCategoryRow[] = [
    {
      id: 'cat-1',
      event_id: 'evt-123',
      name: 'Lugar',
      sort_order: 0,
      created_at: '2026-11-01T00:00:00Z',
    },
    {
      id: 'cat-2',
      event_id: 'evt-123',
      name: 'Decoración',
      sort_order: 1,
      created_at: '2026-11-01T00:00:00Z',
    },
    {
      id: 'cat-3',
      event_id: 'evt-123',
      name: 'Comida y bebidas',
      sort_order: 2,
      created_at: '2026-11-01T00:00:00Z',
    },
  ];

  beforeEach(async () => {
    mockEventContext = {
      event: signal<EventRow | null>({
        id: 'evt-123',
        name: 'Baby shower',
        budget_cop: null,
        city: 'Neiva',
        venue_name: null,
        venue_address: null,
        starts_at: '2026-11-29T15:00:00Z',
        rsvp_deadline: '2026-11-14T23:59:59Z',
        welcome_message: null,
        theme_id: 'baby-shower',
        team_id: 'team-1',
        created_by: 'usr-1',
        created_at: '2026-10-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
        map_url: null,
      }),
      role: signal<EventRole | null>('owner'),
      isOwner: signal(true),
      error: signal<string | null>(null),
      loading: signal(false),
      load: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn(),
    };

    mockBudgetRepo = {
      listCategories: vi.fn().mockResolvedValue(sampleCategories),
      createCategory: vi.fn().mockResolvedValue({
        id: 'cat-4',
        event_id: 'evt-123',
        name: 'Música',
        sort_order: 3,
        created_at: '2026-11-01T00:00:00Z',
      }),
      renameCategory: vi.fn().mockResolvedValue({
        id: 'cat-1',
        event_id: 'evt-123',
        name: 'Lugar y alquiler',
        sort_order: 0,
        created_at: '2026-11-01T00:00:00Z',
      }),
      removeCategory: vi.fn().mockResolvedValue(undefined),
      swapCategoryOrder: vi.fn().mockResolvedValue(undefined),
      addSuggestedCategories: vi.fn().mockResolvedValue(4),
    };

    mockAlertCtrl = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
        onDidDismiss: vi.fn().mockResolvedValue({ role: 'confirm' }),
      }),
    };

    mockToastCtrl = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
      }),
    };

    await TestBed.configureTestingModule({
      imports: [CategoriesPage],
      providers: [
        provideRouter([]),
        { provide: EventContextService, useValue: mockEventContext },
        { provide: BudgetRepository, useValue: mockBudgetRepo },
        { provide: AlertController, useValue: mockAlertCtrl },
        { provide: ToastController, useValue: mockToastCtrl },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(CategoriesPage);
    fixture.componentRef.setInput('id', 'evt-123');
    component = fixture.componentInstance;
  });

  it('lista: muestra la lista de categorías existentes', async () => {
    await component.ionViewWillEnter();
    fixture.detectChanges();

    expect(component.categories()).toEqual(sampleCategories);
    expect(component.loading()).toBe(false);

    const cards = fixture.debugElement.queryAll(By.css('.category-card'));
    expect(cards.length).toBe(3);

    const names = fixture.debugElement.queryAll(By.css('.category-name'));
    expect(names[0].nativeElement.textContent.trim()).toBe('Lugar');
    expect(names[1].nativeElement.textContent.trim()).toBe('Decoración');
    expect(names[2].nativeElement.textContent.trim()).toBe('Comida y bebidas');
  });

  it('vacío: muestra mensaje de estado vacío y botón para agregar sugeridas', async () => {
    mockBudgetRepo.listCategories.mockResolvedValue([]);
    await component.ionViewWillEnter();
    fixture.detectChanges();

    const emptyState = fixture.debugElement.query(By.css('app-empty-state'));
    expect(emptyState).toBeTruthy();
    expect(emptyState.nativeElement.textContent).toContain(
      'Todavía no hay categorías. Agrega las sugeridas o crea las tuyas.',
    );
  });

  it('sugeridas con N y con 0: maneja plural, singular y ya existentes', async () => {
    await component.ionViewWillEnter();

    // Caso N = 4
    mockBudgetRepo.addSuggestedCategories.mockResolvedValue(4);
    await component.addSuggestedCategories();
    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Agregamos 4 categorías.',
        color: 'success',
      }),
    );

    // Caso N = 1
    mockBudgetRepo.addSuggestedCategories.mockResolvedValue(1);
    await component.addSuggestedCategories();
    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Agregamos 1 categoría.',
        color: 'success',
      }),
    );

    // Caso 0 (ya estaban)
    mockBudgetRepo.addSuggestedCategories.mockResolvedValue(0);
    await component.addSuggestedCategories();
    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Las categorías sugeridas ya estaban en la lista.',
        color: 'medium',
      }),
    );
  });

  it('nombre vacío rechazado: no permite guardar sin nombre y avisa', async () => {
    await component.ionViewWillEnter();
    await component.openCreateCategoryModal();

    expect(mockAlertCtrl.create).toHaveBeenCalled();
    const createArgs = mockAlertCtrl.create.mock.calls[0][0];
    const saveButton = createArgs.buttons.find(
      (b: { text?: string }) => b.text === 'Guardar',
    );

    expect(saveButton).toBeDefined();

    // Envío con espacios vacíos
    const result = saveButton.handler({ name: '   ' });
    expect(result).toBe(false);
    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Escribe un nombre.',
        color: 'danger',
      }),
    );
    expect(mockBudgetRepo.createCategory).not.toHaveBeenCalled();

    // Envío válido
    const validResult = saveButton.handler({ name: 'Animación' });
    expect(validResult).toBe(true);
    expect(mockBudgetRepo.createCategory).toHaveBeenCalledWith(expect.any(String), 'evt-123', 'Animación', 3);
  });

  it('dos intentos de crear la misma categoría después de un error envían el mismo id', async () => {
    mockBudgetRepo.createCategory.mockRejectedValueOnce(new Error('Fallo de red'));
    mockBudgetRepo.createCategory.mockResolvedValueOnce({
      id: 'cat-new',
      event_id: 'evt-123',
      name: 'Música',
      sort_order: 3,
      created_at: '',
    });

    await component.ionViewWillEnter();
    await component.openCreateCategoryModal();

    const createArgs = mockAlertCtrl.create.mock.calls[0][0];
    const saveButton = createArgs.buttons.find(
      (b: { text?: string }) => b.text === 'Guardar',
    );

    saveButton.handler({ name: 'Música' });
    expect(mockBudgetRepo.createCategory).toHaveBeenCalledTimes(1);
    const firstId = mockBudgetRepo.createCategory.mock.calls[0][0];
    expect(typeof firstId).toBe('string');
    expect(firstId.length).toBeGreaterThan(0);

    await component.openCreateCategoryModal();
    const secondCreateArgs = mockAlertCtrl.create.mock.calls[1][0];
    const secondSaveButton = secondCreateArgs.buttons.find(
      (b: { text?: string }) => b.text === 'Guardar',
    );
    secondSaveButton.handler({ name: 'Música' });

    expect(mockBudgetRepo.createCategory).toHaveBeenCalledTimes(2);
    const secondId = mockBudgetRepo.createCategory.mock.calls[1][0];
    expect(secondId).toBe(firstId);
  });

  it('error de borrado mostrado en el aviso: muestra err.message en toast', async () => {
    await component.ionViewWillEnter();

    mockBudgetRepo.removeCategory.mockRejectedValue(
      new Error('Esta categoría tiene gastos. Muévelos a otra categoría antes de borrarla.'),
    );

    await component.confirmDeleteCategory(sampleCategories[0]);

    const alertArgs = mockAlertCtrl.create.mock.calls[0][0];
    const deleteButton = alertArgs.buttons.find(
      (b: { text?: string }) => b.text === 'Borrar',
    );
    expect(deleteButton).toBeDefined();

    deleteButton.handler();
    await fixture.whenStable();

    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Esta categoría tiene gastos. Muévelos a otra categoría antes de borrarla.',
        color: 'danger',
      }),
    );
  });

  it('subir y bajar: llama a swapCategoryOrder con los elementos adyacentes', async () => {
    await component.ionViewWillEnter();

    // Subir elemento 1 (Decoración con Lugar)
    await component.moveCategoryUp(1);
    expect(mockBudgetRepo.swapCategoryOrder).toHaveBeenCalledWith(
      sampleCategories[1],
      sampleCategories[0],
    );

    // Bajar elemento 0 (Lugar con Decoración)
    await component.moveCategoryDown(0);
    expect(mockBudgetRepo.swapCategoryOrder).toHaveBeenCalledWith(
      sampleCategories[0],
      sampleCategories[1],
    );
  });

  it('botones deshabilitados en los extremos: primer elemento no puede subir, último no puede bajar', async () => {
    await component.ionViewWillEnter();
    fixture.detectChanges();

    const cards = fixture.debugElement.queryAll(By.css('.category-card'));
    expect(cards.length).toBe(3);

    // Primer elemento: botón subir deshabilitado, bajar habilitado
    const firstRowButtons = cards[0].queryAll(By.css('.action-button'));
    const firstUp = firstRowButtons[0].nativeElement as HTMLButtonElement;
    const firstDown = firstRowButtons[1].nativeElement as HTMLButtonElement;
    expect(firstUp.disabled ?? firstUp.hasAttribute('disabled')).toBe(true);
    expect(firstDown.disabled ?? firstDown.hasAttribute('disabled')).toBe(false);

    // Último elemento: botón subir habilitado, bajar deshabilitado
    const lastRowButtons = cards[2].queryAll(By.css('.action-button'));
    const lastUp = lastRowButtons[0].nativeElement as HTMLButtonElement;
    const lastDown = lastRowButtons[1].nativeElement as HTMLButtonElement;
    expect(lastUp.disabled ?? lastUp.hasAttribute('disabled')).toBe(false);
    expect(lastDown.disabled ?? lastDown.hasAttribute('disabled')).toBe(true);
  });

  it('ayudante redirigido: redirige al panel si el rol no es owner', async () => {
    mockEventContext.role.set('helper');
    mockEventContext.isOwner.set(false);

    await component.ionViewWillEnter();

    expect(router.navigate).toHaveBeenCalledWith(['/eventos', 'evt-123', 'panel'], {
      replaceUrl: true,
    });
    expect(mockBudgetRepo.listCategories).not.toHaveBeenCalled();
  });
});
