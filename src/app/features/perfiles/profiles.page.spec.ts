import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import {
  EventContextService,
  EventRole,
  EventRow,
  TeamProfileRow,
  TeamProfilesRepository,
} from '../../core';
import { ProfilesPage } from './profiles.page';

describe('ProfilesPage', () => {
  let fixture: ComponentFixture<ProfilesPage>;
  let component: ProfilesPage;
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

  let mockProfilesRepo: {
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    rename: ReturnType<typeof vi.fn>;
    setArchived: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    swapOrder: ReturnType<typeof vi.fn>;
    canManage: ReturnType<typeof vi.fn>;
  };

  let mockAlertCtrl: {
    create: ReturnType<typeof vi.fn>;
  };

  let mockToastCtrl: {
    create: ReturnType<typeof vi.fn>;
  };

  const sampleActiveProfiles: TeamProfileRow[] = [
    {
      id: 'prof-1',
      team_id: 'team-1',
      name: 'Juan',
      sort_order: 0,
      archived_at: null,
      created_at: '2026-11-01T00:00:00Z',
    },
    {
      id: 'prof-2',
      team_id: 'team-1',
      name: 'Laura',
      sort_order: 1,
      archived_at: null,
      created_at: '2026-11-01T00:00:00Z',
    },
  ];

  const sampleArchivedProfiles: TeamProfileRow[] = [
    {
      id: 'prof-3',
      team_id: 'team-1',
      name: 'Mamá',
      sort_order: 2,
      archived_at: '2026-11-02T10:00:00Z',
      created_at: '2026-11-01T00:00:00Z',
    },
  ];

  const allSampleProfiles = [...sampleActiveProfiles, ...sampleArchivedProfiles];

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

    mockProfilesRepo = {
      list: vi.fn().mockResolvedValue(allSampleProfiles),
      create: vi.fn().mockResolvedValue({
        id: 'prof-4',
        team_id: 'team-1',
        name: 'Carlos',
        sort_order: 3,
        archived_at: null,
        created_at: '2026-11-01T00:00:00Z',
      }),
      rename: vi.fn().mockResolvedValue({
        id: 'prof-1',
        team_id: 'team-1',
        name: 'Juan Diego',
        sort_order: 0,
        archived_at: null,
        created_at: '2026-11-01T00:00:00Z',
      }),
      setArchived: vi.fn().mockResolvedValue({
        id: 'prof-1',
        team_id: 'team-1',
        name: 'Juan',
        sort_order: 0,
        archived_at: '2026-11-05T00:00:00Z',
        created_at: '2026-11-01T00:00:00Z',
      }),
      remove: vi.fn().mockResolvedValue(undefined),
      swapOrder: vi.fn().mockResolvedValue(undefined),
      canManage: vi.fn().mockResolvedValue(true),
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
      imports: [ProfilesPage],
      providers: [
        provideRouter([]),
        { provide: EventContextService, useValue: mockEventContext },
        { provide: TeamProfilesRepository, useValue: mockProfilesRepo },
        { provide: AlertController, useValue: mockAlertCtrl },
        { provide: ToastController, useValue: mockToastCtrl },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(ProfilesPage);
    fixture.componentRef.setInput('id', 'evt-123');
    component = fixture.componentInstance;
  });

  it('sin equipo (no llama a list): muestra estado vacío sin equipo', async () => {
    mockEventContext.event.set({
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
      team_id: null,
      created_by: 'usr-1',
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
      map_url: null,
    });

    await component.ionViewWillEnter();
    fixture.detectChanges();

    expect(mockProfilesRepo.list).not.toHaveBeenCalled();
    expect(component.teamId()).toBeNull();

    const emptyState = fixture.debugElement.query(By.css('app-empty-state'));
    expect(emptyState).toBeTruthy();
    expect(emptyState.nativeElement.textContent).toContain(
      'Este evento no tiene perfiles disponibles.',
    );
  });

  it('canManage falso (sin botones): muestra lista de solo lectura y mensaje informativo', async () => {
    mockProfilesRepo.canManage.mockResolvedValue(false);

    await component.ionViewWillEnter();
    fixture.detectChanges();

    expect(component.canManage()).toBe(false);

    // Mensaje visible
    const note = fixture.debugElement.query(By.css('.manage-note'));
    expect(note).toBeTruthy();
    expect(note.nativeElement.textContent).toContain(
      'Solo los propietarios del equipo pueden cambiar los perfiles.',
    );

    // Sin botón "Agregar perfil"
    const addBtn = fixture.debugElement
      .queryAll(By.css('ion-button'))
      .find((b) => b.nativeElement.textContent.includes('Agregar perfil'));
    expect(addBtn).toBeUndefined();

    // Sin botones de acciones en las filas
    const actionButtons = fixture.debugElement.queryAll(By.css('.profile-actions'));
    expect(actionButtons.length).toBe(0);
  });

  it('activos y archivados separados: muestra cada grupo en su respectiva sección', async () => {
    await component.ionViewWillEnter();
    fixture.detectChanges();

    expect(component.activeProfiles().length).toBe(2);
    expect(component.archivedProfiles().length).toBe(1);

    const archivedHeading = fixture.debugElement.query(By.css('.archived-section .section-heading'));
    expect(archivedHeading).toBeTruthy();
    expect(archivedHeading.nativeElement.textContent).toContain(
      'Archivados: no salen en los selectores, pero siguen en el historial.',
    );

    const names = fixture.debugElement.queryAll(By.css('.profile-name'));
    expect(names.map((n) => n.nativeElement.textContent.trim())).toEqual(['Juan', 'Laura', 'Mamá']);
  });

  it('archivar: archiva perfil activo correctamente', async () => {
    await component.ionViewWillEnter();

    await component.archiveProfile(sampleActiveProfiles[0]);

    expect(mockProfilesRepo.setArchived).toHaveBeenCalledWith('prof-1', true);
    expect(mockProfilesRepo.list).toHaveBeenCalled();
  });

  it('desarchivar: desarchiva perfil archivado correctamente', async () => {
    await component.ionViewWillEnter();

    await component.unarchiveProfile(sampleArchivedProfiles[0]);

    expect(mockProfilesRepo.setArchived).toHaveBeenCalledWith('prof-3', false);
    expect(mockProfilesRepo.list).toHaveBeenCalled();
  });

  it('nombre duplicado mostrado en el aviso: muestra mensaje de error al fallar creación', async () => {
    await component.ionViewWillEnter();
    mockProfilesRepo.create.mockRejectedValue(
      new Error('Ya hay un perfil activo con ese nombre.'),
    );

    await component.openCreateProfileModal();
    const alertArgs = mockAlertCtrl.create.mock.calls[0][0];
    const saveButton = alertArgs.buttons.find(
      (b: { text?: string }) => b.text === 'Guardar',
    );

    saveButton.handler({ name: 'Juan' });
    await fixture.whenStable();

    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Ya hay un perfil activo con ese nombre.',
        color: 'danger',
      }),
    );
  });

  it('borrar en uso: muestra aviso específico si el perfil ya se usó', async () => {
    await component.ionViewWillEnter();
    mockProfilesRepo.remove.mockRejectedValue(
      new Error('Este perfil ya se usó. Puedes archivarlo.'),
    );

    await component.confirmDeleteProfile(sampleActiveProfiles[0]);
    const alertArgs = mockAlertCtrl.create.mock.calls[0][0];
    const deleteButton = alertArgs.buttons.find(
      (b: { text?: string }) => b.text === 'Borrar',
    );

    deleteButton.handler();
    await fixture.whenStable();

    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Este perfil ya se usó. Puedes archivarlo.',
        color: 'danger',
      }),
    );
  });

  it('ayudante redirigido: redirige al panel si el rol no es owner', async () => {
    mockEventContext.role.set('helper');
    mockEventContext.isOwner.set(false);

    await component.ionViewWillEnter();

    expect(router.navigate).toHaveBeenCalledWith(['/eventos', 'evt-123', 'panel'], {
      replaceUrl: true,
    });
    expect(mockProfilesRepo.list).not.toHaveBeenCalled();
  });
});
