import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ModalController, SearchbarCustomEvent, ToastController } from '@ionic/angular';
import { Haptics, NotificationType } from '@capacitor/haptics';
import {
  ArrivalConnection,
  ArrivalCounts,
  ArrivalInvitationView,
  ArrivalNotice,
  ArrivalSessionService,
  ArrivalSnapshot,
  QrScannerService,
  RealtimeService,
  ThemeService,
} from '../../../core';
import { ArrivalGroupComponent } from '../grupo/arrival-group.component';
import { ArrivalsPage } from './arrivals.page';

vi.mock('@capacitor/haptics', () => ({
  Haptics: {
    notification: vi.fn().mockResolvedValue(undefined),
  },
  NotificationType: {
    Success: 'SUCCESS',
    Warning: 'WARNING',
    Error: 'ERROR',
  },
}));

describe('ArrivalsPage', () => {
  let fixture: ComponentFixture<ArrivalsPage>;
  let component: ArrivalsPage;
  let mockSession: {
    eventId: ReturnType<typeof signal<string | null>>;
    snapshot: ReturnType<typeof signal<ArrivalSnapshot | null>>;
    invitations: ReturnType<typeof signal<ArrivalInvitationView[]>>;
    counts: ReturnType<typeof signal<ArrivalCounts>>;
    pendingCount: ReturnType<typeof signal<number>>;
    online: ReturnType<typeof signal<boolean>>;
    connection: ReturnType<typeof signal<ArrivalConnection>>;
    hasSession: ReturnType<typeof signal<boolean>>;
    loading: ReturnType<typeof signal<boolean>>;
    refreshing: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    syncing: ReturnType<typeof signal<boolean>>;
    syncError: ReturnType<typeof signal<string | null>>;
    notices: ReturnType<typeof signal<ArrivalNotice[]>>;
    downloadedAt: ReturnType<typeof signal<string | null>>;
    downloadedAtText: ReturnType<typeof signal<string>>;
    stale: ReturnType<typeof signal<boolean>>;
    open: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    retrySync: ReturnType<typeof vi.fn>;
    findByCode: ReturnType<typeof vi.fn>;
    search: ReturnType<typeof vi.fn>;
    dismissNotices: ReturnType<typeof vi.fn>;
  };
  let mockThemeService: {
    apply: ReturnType<typeof vi.fn>;
    current: ReturnType<typeof signal<string>>;
    asset: ReturnType<typeof vi.fn>;
  };
  let mockRealtime: { watch: ReturnType<typeof vi.fn> };
  let mockQrScanner: { isAvailable: ReturnType<typeof vi.fn>; scan: ReturnType<typeof vi.fn> };
  let mockToastCtrl: { create: ReturnType<typeof vi.fn> };
  let mockModalCtrl: { create: ReturnType<typeof vi.fn> };
  let mockStopRealtime: ReturnType<typeof vi.fn>;

  const sampleSnapshot: ArrivalSnapshot = {
    version: 1,
    eventId: 'evt-123',
    userId: 'usr-1',
    downloadedAt: '2026-11-29T10:00:00-05:00',
    event: {
      id: 'evt-123',
      name: 'Baby Shower Neiva',
      theme_id: 'baby-shower',
      starts_at: '2026-11-29T15:00:00-05:00',
    },
    invitations: [],
  };

  const sampleInvitationView: ArrivalInvitationView = {
    id: 'inv-1',
    code: 'ABC2345678',
    group_name: 'Familia Perez',
    kind: 'group',
    guests: [
      {
        id: 'g-1',
        full_name: 'Ana Perez',
        rsvp: 'accepted',
        arrivedAt: '2026-11-29T15:10:00-05:00',
        synced: true,
      },
      {
        id: 'g-2',
        full_name: 'Carlos Perez',
        rsvp: 'accepted',
        arrivedAt: null,
        synced: true,
      },
    ],
    arrivedCount: 1,
    totalCount: 2,
    queuedCount: 0,
  };

  beforeEach(async () => {
    mockStopRealtime = vi.fn();
    mockSession = {
      eventId: signal<string | null>('evt-123'),
      snapshot: signal<ArrivalSnapshot | null>(null),
      invitations: signal<ArrivalInvitationView[]>([]),
      counts: signal<ArrivalCounts>({
        confirmed: 10,
        arrivedConfirmed: 4,
        arrivedUnconfirmed: 1,
        arrivedTotal: 5,
      }),
      pendingCount: signal<number>(0),
      online: signal<boolean>(true),
      connection: signal<ArrivalConnection>('online'),
      hasSession: signal<boolean>(true),
      loading: signal<boolean>(false),
      refreshing: signal<boolean>(false),
      error: signal<string | null>(null),
      syncing: signal<boolean>(false),
      syncError: signal<string | null>(null),
      notices: signal<ArrivalNotice[]>([]),
      downloadedAt: signal<string | null>('2026-11-29T10:00:00-05:00'),
      downloadedAtText: signal<string>('hoy a las 10:00 a. m.'),
      stale: signal<boolean>(false),
      open: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      retrySync: vi.fn().mockResolvedValue(undefined),
      findByCode: vi.fn(),
      search: vi.fn().mockReturnValue([]),
      dismissNotices: vi.fn(),
    };

    mockThemeService = {
      apply: vi.fn(),
      current: signal('baby-shower'),
      asset: vi.fn().mockReturnValue('assets/themes/baby-shower/empty-state.webp'),
    };

    mockRealtime = {
      watch: vi.fn().mockReturnValue(mockStopRealtime),
    };

    mockQrScanner = {
      isAvailable: vi.fn().mockReturnValue(true),
      scan: vi.fn().mockResolvedValue({ status: 'scanned', text: 'ABC2345678' }),
    };

    mockToastCtrl = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
      }),
    };

    mockModalCtrl = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
        onDidDismiss: vi.fn().mockResolvedValue({ role: 'dismiss' }),
      }),
    };

    await TestBed.configureTestingModule({
      imports: [ArrivalsPage],
      providers: [
        { provide: ArrivalSessionService, useValue: mockSession },
        { provide: ThemeService, useValue: mockThemeService },
        { provide: RealtimeService, useValue: mockRealtime },
        { provide: QrScannerService, useValue: mockQrScanner },
        { provide: ToastController, useValue: mockToastCtrl },
        { provide: ModalController, useValue: mockModalCtrl },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ArrivalsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('id', 'evt-123');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // 1. La barra no tiene .header-indicators ni insignias
  it('does not render .header-indicators or badges in the toolbar', () => {
    const element = fixture.nativeElement as HTMLElement;
    const toolbar = element.querySelector('ion-toolbar');
    expect(toolbar).not.toBeNull();
    expect(toolbar?.querySelector('.header-indicators')).toBeNull();
    expect(toolbar?.querySelector('.badge-soft-success')).toBeNull();
    expect(toolbar?.querySelector('.badge-soft-warning')).toBeNull();
  });

  // 2. .connection-badge muestra los tres textos y clases según connection
  it('renders .connection-badge with text and classes according to connection', async () => {
    mockSession.snapshot.set(sampleSnapshot);

    mockSession.connection.set('online');
    fixture.detectChanges();
    await fixture.whenStable();
    let badge = fixture.nativeElement.querySelector('.connection-badge');
    expect(badge.classList).toContain('connection-badge--online');
    expect(badge.classList).toContain('badge-soft-success');
    expect(badge.textContent.trim()).toBe('En línea');

    mockSession.connection.set('slow');
    fixture.detectChanges();
    await fixture.whenStable();
    badge = fixture.nativeElement.querySelector('.connection-badge');
    expect(badge.classList).toContain('connection-badge--slow');
    expect(badge.classList).toContain('badge-soft-warning');
    expect(badge.textContent.trim()).toBe('Conexión lenta');

    mockSession.connection.set('offline');
    fixture.detectChanges();
    await fixture.whenStable();
    badge = fixture.nativeElement.querySelector('.connection-badge');
    expect(badge.classList).toContain('connection-badge--offline');
    expect(badge.classList).toContain('badge-soft-warning');
    expect(badge.textContent.trim()).toBe('Sin conexión');
  });

  // 3. .counter-offline aparece con 'slow' y 'offline', y no con 'online'
  it('renders .counter-offline with slow and offline connection, but not with online', async () => {
    mockSession.snapshot.set(sampleSnapshot);

    mockSession.connection.set('online');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.counter-offline')).toBeNull();

    mockSession.connection.set('slow');
    fixture.detectChanges();
    await fixture.whenStable();
    const slowCounter = fixture.nativeElement.querySelector('.counter-offline');
    expect(slowCounter).not.toBeNull();
    expect(slowCounter.textContent).toContain('Según este celular');

    mockSession.connection.set('offline');
    fixture.detectChanges();
    await fixture.whenStable();
    const offlineCounter = fixture.nativeElement.querySelector('.counter-offline');
    expect(offlineCounter).not.toBeNull();
    expect(offlineCounter.textContent).toContain('Según este celular');
  });

  // 4. .list-age con "hace 4 min" (reloj fijo) y list-age--stale pasados 61 minutos con el texto de "Actualízala…"
  it('displays .list-age with "hace 4 min" and adds .list-age--stale after 61 minutes', async () => {
    mockSession.snapshot.set(sampleSnapshot);
    mockSession.downloadedAt.set('2026-11-29T10:00:00-05:00');

    component.now.set(new Date('2026-11-29T10:04:00-05:00'));
    fixture.detectChanges();
    await fixture.whenStable();

    let listAge = fixture.nativeElement.querySelector('.list-age');
    expect(listAge).not.toBeNull();
    expect(listAge.textContent).toContain('Lista actualizada hace 4 min');
    expect(listAge.classList).not.toContain('list-age--stale');
    expect(listAge.textContent).not.toContain('Actualízala cuando haya conexión');

    component.now.set(new Date('2026-11-29T11:01:00-05:00'));
    fixture.detectChanges();
    await fixture.whenStable();

    listAge = fixture.nativeElement.querySelector('.list-age');
    expect(listAge.classList).toContain('list-age--stale');
    expect(listAge.textContent).toContain('Lista actualizada hace 1 h. Actualízala cuando haya conexión.');
  });

  it('does not render .list-age when downloadedAt is null', async () => {
    mockSession.snapshot.set(sampleSnapshot);
    mockSession.downloadedAt.set(null);

    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.list-age')).toBeNull();
  });

  // 5. .queue-line en singular y plural; spinner con syncing
  it('renders .queue-line in singular and plural, with spinner when syncing', async () => {
    mockSession.snapshot.set(sampleSnapshot);

    mockSession.pendingCount.set(0);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.queue-line')).toBeNull();

    mockSession.pendingCount.set(1);
    mockSession.syncing.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
    let queueLine = fixture.nativeElement.querySelector('.queue-line');
    expect(queueLine).not.toBeNull();
    expect(queueLine.textContent).toContain('1 llegada guardada en este celular, por sincronizar');
    expect(queueLine.querySelector('ion-spinner')).toBeNull();

    mockSession.syncing.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    queueLine = fixture.nativeElement.querySelector('.queue-line');
    expect(queueLine.querySelector('ion-spinner')).not.toBeNull();

    mockSession.pendingCount.set(5);
    fixture.detectChanges();
    await fixture.whenStable();
    queueLine = fixture.nativeElement.querySelector('.queue-line');
    expect(queueLine.textContent).toContain('5 llegadas guardadas en este celular, por sincronizar');
  });

  // 6. .sync-error con el mensaje y Reintentar ahora llamando retrySync; deshabilitado sin conexión; sin cola no aparece
  it('renders .sync-error with retry button, disabled when offline, and hidden without queue', async () => {
    mockSession.snapshot.set(sampleSnapshot);

    mockSession.pendingCount.set(0);
    mockSession.syncError.set('Error en el servidor');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.sync-error')).toBeNull();

    mockSession.pendingCount.set(2);
    mockSession.online.set(true);
    mockSession.syncing.set(false);
    fixture.detectChanges();
    await fixture.whenStable();

    const syncErrorEl = fixture.nativeElement.querySelector('.sync-error');
    expect(syncErrorEl).not.toBeNull();
    expect(syncErrorEl.textContent).toContain(
      'No pudimos sincronizar: Error en el servidor. Se vuelve a intentar sola.',
    );

    const retryBtn = fixture.nativeElement.querySelector('.sync-retry') as HTMLButtonElement | null;
    expect(retryBtn).not.toBeNull();
    expect(retryBtn?.disabled).toBe(false);

    retryBtn?.click();
    expect(mockSession.retrySync).toHaveBeenCalled();

    mockSession.online.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(retryBtn?.disabled).toBe(true);

    mockSession.online.set(true);
    mockSession.syncing.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(retryBtn?.disabled).toBe(true);
  });

  // 7. Resumen de búsqueda: los tres tonos, concordancia "1 de 3 llegó" y textos individuales
  it('calculates arrived summary correctly with tones, singular agreement, and individual texts', () => {
    // All arrived - group
    const completeGroup = component.formatArrivedSummary({
      arrivedCount: 3,
      totalCount: 3,
      kind: 'group',
    });
    expect(completeGroup).toEqual({ text: 'Ya llegaron todos', tone: 'complete' });

    // All arrived - individual
    const completeIndiv = component.formatArrivedSummary({
      arrivedCount: 1,
      totalCount: 1,
      kind: 'individual',
    });
    expect(completeIndiv).toEqual({ text: 'Ya llegó', tone: 'complete' });

    // Partial - 1 arrived
    const partialSingle = component.formatArrivedSummary({
      arrivedCount: 1,
      totalCount: 3,
      kind: 'group',
    });
    expect(partialSingle).toEqual({ text: '1 de 3 llegó', tone: 'partial' });

    // Partial - multiple arrived
    const partialMulti = component.formatArrivedSummary({
      arrivedCount: 2,
      totalCount: 3,
      kind: 'group',
    });
    expect(partialMulti).toEqual({ text: '2 de 3 llegaron', tone: 'partial' });

    // None arrived - group
    const noneGroup = component.formatArrivedSummary({
      arrivedCount: 0,
      totalCount: 3,
      kind: 'group',
    });
    expect(noneGroup).toEqual({ text: '0 de 3 llegaron', tone: 'none' });

    // None arrived - individual
    const noneIndiv = component.formatArrivedSummary({
      arrivedCount: 0,
      totalCount: 1,
      kind: 'individual',
    });
    expect(noneIndiv).toEqual({ text: 'No ha llegado', tone: 'none' });
  });

  it('renders search results with appropriate badges, counts, and complete styles', async () => {
    mockSession.snapshot.set(sampleSnapshot);
    const completeItem: ArrivalInvitationView = {
      ...sampleInvitationView,
      id: 'inv-complete',
      group_name: 'Familia Gomez',
      arrivedCount: 2,
      totalCount: 2,
      queuedCount: 0,
    };
    const partialItem: ArrivalInvitationView = {
      ...sampleInvitationView,
      id: 'inv-partial',
      group_name: 'Familia Ruiz',
      arrivedCount: 1,
      totalCount: 3,
      queuedCount: 0,
    };
    const noneItem: ArrivalInvitationView = {
      ...sampleInvitationView,
      id: 'inv-none',
      group_name: 'Familia Diaz',
      arrivedCount: 0,
      totalCount: 2,
      queuedCount: 0,
    };

    mockSession.search.mockReturnValue([completeItem, partialItem, noneItem]);

    component.onSearchInput({ detail: { value: 'Familia' } } as SearchbarCustomEvent);
    fixture.detectChanges();
    await fixture.whenStable();

    const items = fixture.nativeElement.querySelectorAll('.search-results-list ion-item');
    expect(items.length).toBe(3);

    // Complete item
    expect(items[0].classList).toContain('search-item--complete');
    const completeBadge = items[0].querySelector('.search-item-badge--complete');
    expect(completeBadge).not.toBeNull();
    expect(completeBadge.textContent.trim()).toBe('Ya llegaron todos');

    // Partial item
    expect(items[1].classList).not.toContain('search-item--complete');
    const partialBadge = items[1].querySelector('.search-item-badge--partial');
    expect(partialBadge).not.toBeNull();
    expect(partialBadge.textContent.trim()).toBe('1 de 3 llegó');

    // None item
    expect(items[2].classList).not.toContain('search-item--complete');
    const noneCount = items[2].querySelector('.search-item-count');
    expect(noneCount).not.toBeNull();
    expect(noneCount.textContent.trim()).toBe('0 de 2 llegaron');
  });

  // 8. .search-item-queued con queuedCount
  it('renders .search-item-queued when item has queued arrivals', async () => {
    mockSession.snapshot.set(sampleSnapshot);
    const queuedSingle: ArrivalInvitationView = {
      ...sampleInvitationView,
      id: 'inv-q1',
      queuedCount: 1,
    };
    const queuedMultiple: ArrivalInvitationView = {
      ...sampleInvitationView,
      id: 'inv-q2',
      queuedCount: 3,
    };

    mockSession.search.mockReturnValue([queuedSingle, queuedMultiple]);
    component.onSearchInput({ detail: { value: 'Perez' } } as SearchbarCustomEvent);
    fixture.detectChanges();
    await fixture.whenStable();

    const queuedBadges = fixture.nativeElement.querySelectorAll('.search-item-queued');
    expect(queuedBadges.length).toBe(2);
    expect(queuedBadges[0].textContent.trim()).toBe('1 sin sincronizar');
    expect(queuedBadges[0].classList).toContain('badge-soft-warning');
    expect(queuedBadges[1].textContent.trim()).toBe('3 sin sincronizar');
  });

  // 9. Tras cerrar la hoja con 'registered', la búsqueda queda vacía; con otro rol, no
  it('clears search when group modal dismisses with registered role, but retains it with other roles', async () => {
    mockSession.snapshot.set(sampleSnapshot);
    component.onSearchInput({ detail: { value: 'Perez' } } as SearchbarCustomEvent);
    expect(component.searchQuery()).toBe('Perez');

    mockModalCtrl.create.mockResolvedValueOnce({
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockResolvedValue({ role: 'dismiss' }),
    });
    await component.openGroup('inv-1');
    expect(component.searchQuery()).toBe('Perez');

    mockModalCtrl.create.mockResolvedValueOnce({
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockResolvedValue({ role: 'registered' }),
    });
    await component.openGroup('inv-1');
    expect(component.searchQuery()).toBe('');
  });

  // 10. El reloj se detiene al salir de la vista
  it('stops the clock interval when leaving the view', () => {
    vi.useFakeTimers();
    try {
      component.ionViewWillEnter();
      const baseTime = new Date('2026-11-29T10:00:00-05:00');
      component.now.set(baseTime);

      vi.advanceTimersByTime(60_000);
      const advancedTime = component.now();

      component.ionViewWillLeave();
      vi.advanceTimersByTime(120_000);

      expect(component.now()).toBe(advancedTime);
    } finally {
      vi.useRealTimers();
    }
  });

  // 11. Pruebas existentes
  it('calls session.open on ionViewWillEnter and cleans up on ionViewWillLeave', async () => {
    component.ionViewWillEnter();
    expect(mockSession.open).toHaveBeenCalledWith('evt-123');

    fixture.detectChanges();
    await fixture.whenStable();

    expect(mockRealtime.watch).toHaveBeenCalledWith(
      'evt-123',
      ['guests', 'invitations'],
      expect.any(Function),
      expect.anything(),
    );

    component.ionViewWillLeave();
    expect(mockStopRealtime).toHaveBeenCalled();
  });

  it('applies theme when snapshot is available', async () => {
    component.ionViewWillEnter();
    mockSession.snapshot.set(sampleSnapshot);

    fixture.detectChanges();
    await fixture.whenStable();

    expect(mockThemeService.apply).toHaveBeenCalledWith('baby-shower');
    expect(fixture.nativeElement.querySelector('ion-title')?.textContent?.trim()).toBe('Llegadas');
  });

  it('renders loading spinner when loading is true', async () => {
    mockSession.loading.set(true);

    fixture.detectChanges();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.loading-state')).not.toBeNull();
  });

  it('renders empty state when offline and no list', async () => {
    mockSession.loading.set(false);
    mockSession.snapshot.set(null);
    mockSession.online.set(false);

    fixture.detectChanges();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain(
      'Descarga la lista con conexión antes del evento.',
    );
  });

  it('renders empty state with retry button when no list and error occurred', async () => {
    mockSession.loading.set(false);
    mockSession.snapshot.set(null);
    mockSession.online.set(true);
    mockSession.error.set('Error descargando lista');

    fixture.detectChanges();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Error descargando lista');
    expect(element.textContent).toContain('Reintentar');
  });

  it('renders downloading spinner when online without list or error', async () => {
    mockSession.loading.set(false);
    mockSession.snapshot.set(null);
    mockSession.online.set(true);
    mockSession.error.set(null);

    fixture.detectChanges();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Descargando la lista...');
  });

  it('renders counter, notices, scan button, searchbar, and list status when list is present', async () => {
    mockSession.snapshot.set(sampleSnapshot);
    mockSession.invitations.set([sampleInvitationView]);
    mockSession.notices.set([
      {
        eventId: 'evt-123',
        guestId: 'g-1',
        fullName: 'Ana Perez',
        groupName: 'Familia Perez',
        type: 'other_device',
        arrivedAt: '2026-11-29T15:10:00-05:00',
        message: 'Ana Perez ya había sido registrada en otro celular.',
      },
    ]);
    mockSession.error.set('Fallo de red al actualizar');

    fixture.detectChanges();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    const text = element.textContent ?? '';

    // Counter card
    expect(text).toContain('Llegaron');
    expect(text).toContain('4 de 10');
    expect(text).toContain('personas confirmadas');
    expect(text).toContain('1 llegó sin confirmar');

    // Notice card
    expect(text).toContain('Ana Perez ya había sido registrada en otro celular.');
    expect(text).toContain('Entendido');

    // Scan button
    expect(text).toContain('Escanear QR');

    // List status
    expect(text).toContain('Actualizar lista');
    expect(text).toContain('Fallo de red al actualizar');
  });

  it('shows secondary note according to this device when connection is not online', async () => {
    mockSession.snapshot.set(sampleSnapshot);
    mockSession.connection.set('offline');

    fixture.detectChanges();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Según este celular');
  });

  it('searches invitations and displays results with formatted codes and arrived summaries', async () => {
    mockSession.snapshot.set(sampleSnapshot);
    mockSession.search.mockReturnValue([sampleInvitationView]);

    fixture.detectChanges();
    await fixture.whenStable();

    component.onSearchInput({
      detail: { value: 'Perez' },
    } as SearchbarCustomEvent);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(mockSession.search).toHaveBeenCalledWith('Perez');

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Familia Perez');
    expect(element.textContent).toContain('ABC2-3456-78');
    expect(element.textContent).toContain('1 de 2 llegó');

    await component.openGroup(sampleInvitationView.id);
    expect(mockModalCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        component: ArrivalGroupComponent,
        componentProps: { invitationId: 'inv-1' },
        breakpoints: [0, 0.85, 1],
        initialBreakpoint: 0.85,
        expandToScroll: false,
      }),
    );
  });

  it('displays no matches found message when search has query but no results', async () => {
    mockSession.snapshot.set(sampleSnapshot);
    mockSession.search.mockReturnValue([]);

    fixture.detectChanges();
    await fixture.whenStable();

    component.onSearchInput({
      detail: { value: 'Inexistente' },
    } as SearchbarCustomEvent);
    fixture.detectChanges();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('No encontramos coincidencias.');
  });

  it('handles camera unavailable by showing a 4s toast, warning vibration, and focusing searchbar', async () => {
    mockSession.snapshot.set(sampleSnapshot);
    mockQrScanner.isAvailable.mockReturnValue(false);

    fixture.detectChanges();
    await fixture.whenStable();

    await component.onScanQr();

    expect(Haptics.notification).toHaveBeenCalledWith({ type: NotificationType.Warning });
    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'No pudimos usar la cámara. Busca la invitación por nombre o código.',
        duration: 4000,
        color: 'danger',
      }),
    );
  });

  it('handles scan unavailable outcome by showing 4s toast and warning vibration', async () => {
    mockSession.snapshot.set(sampleSnapshot);
    mockQrScanner.isAvailable.mockReturnValue(true);
    mockQrScanner.scan.mockResolvedValue({ status: 'unavailable' });

    fixture.detectChanges();
    await fixture.whenStable();

    await component.onScanQr();

    expect(Haptics.notification).toHaveBeenCalledWith({ type: NotificationType.Warning });
    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'No pudimos usar la cámara. Busca la invitación por nombre o código.',
        duration: 4000,
        color: 'danger',
      }),
    );
  });

  it('handles scan cancelled without doing anything', async () => {
    mockSession.snapshot.set(sampleSnapshot);
    mockQrScanner.isAvailable.mockReturnValue(true);
    mockQrScanner.scan.mockResolvedValue({ status: 'cancelled' });

    fixture.detectChanges();
    await fixture.whenStable();

    await component.onScanQr();

    expect(Haptics.notification).not.toHaveBeenCalled();
    expect(mockToastCtrl.create).not.toHaveBeenCalled();
  });

  it('handles invalid scanned code by showing error toast and vibrating warning', async () => {
    mockSession.snapshot.set(sampleSnapshot);
    mockQrScanner.isAvailable.mockReturnValue(true);
    mockQrScanner.scan.mockResolvedValue({ status: 'scanned', text: 'NOT-A-CONVITE-QR' });

    fixture.detectChanges();
    await fixture.whenStable();

    await component.onScanQr();

    expect(Haptics.notification).toHaveBeenCalledWith({ type: NotificationType.Warning });
    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Este QR no es de una invitación de Convite.',
        color: 'danger',
      }),
    );
  });

  it('handles scanned code not in session by showing error toast and vibrating warning', async () => {
    mockSession.snapshot.set(sampleSnapshot);
    mockQrScanner.isAvailable.mockReturnValue(true);
    mockQrScanner.scan.mockResolvedValue({ status: 'scanned', text: 'ABC2345679' });
    mockSession.findByCode.mockReturnValue(null);

    fixture.detectChanges();
    await fixture.whenStable();

    await component.onScanQr();

    expect(Haptics.notification).toHaveBeenCalledWith({ type: NotificationType.Warning });
    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'No encontramos esta invitación en la lista descargada. Si es nueva, actualiza la lista con conexión o búscala por nombre.',
        color: 'danger',
        duration: 5000,
      }),
    );
  });

  it('opens group sheet when scanned QR code matches an invitation in session', async () => {
    mockSession.snapshot.set(sampleSnapshot);
    mockQrScanner.isAvailable.mockReturnValue(true);
    mockQrScanner.scan.mockResolvedValue({ status: 'scanned', text: 'ABC2345678' });
    mockSession.findByCode.mockReturnValue(sampleInvitationView);

    fixture.detectChanges();
    await fixture.whenStable();

    await component.onScanQr();

    expect(mockModalCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        component: ArrivalGroupComponent,
        componentProps: { invitationId: sampleInvitationView.id },
        expandToScroll: false,
      }),
    );
  });
});
