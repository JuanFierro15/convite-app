import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ModalController, SearchbarCustomEvent, ToastController } from '@ionic/angular';
import { Haptics, NotificationType } from '@capacitor/haptics';
import {
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
    hasSession: ReturnType<typeof signal<boolean>>;
    loading: ReturnType<typeof signal<boolean>>;
    refreshing: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    syncing: ReturnType<typeof signal<boolean>>;
    notices: ReturnType<typeof signal<ArrivalNotice[]>>;
    downloadedAtText: ReturnType<typeof signal<string>>;
    stale: ReturnType<typeof signal<boolean>>;
    open: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
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
      hasSession: signal<boolean>(true),
      loading: signal<boolean>(false),
      refreshing: signal<boolean>(false),
      error: signal<string | null>(null),
      syncing: signal<boolean>(false),
      notices: signal<ArrivalNotice[]>([]),
      downloadedAtText: signal<string>('hoy a las 10:00 a. m.'),
      stale: signal<boolean>(false),
      open: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
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

  it('calls session.open on ionViewWillEnter and cleans up on ionViewWillLeave', async () => {
    component.ionViewWillEnter();
    expect(mockSession.open).toHaveBeenCalledWith('evt-123');

    fixture.detectChanges();
    await fixture.whenStable();

    // With online and hasSession, realtime.watch is called
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
    expect(component.headerTitle()).toBe('Llegadas · Baby Shower Neiva');
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
    mockSession.stale.set(true);
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
    expect(text).toContain('Lista descargada hoy a las 10:00 a. m.');
    expect(text).toContain('Actualizar lista');
    expect(text).toContain('La lista tiene más de 12 horas. Actualízala si hay conexión.');
    expect(text).toContain('Fallo de red al actualizar');
  });

  it('shows secondary note according to this device when offline', async () => {
    mockSession.snapshot.set(sampleSnapshot);
    mockSession.online.set(false);

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
    expect(element.textContent).toContain('1 de 2 llegaron');

    // Tapping result opens group modal
    await component.openGroup(sampleInvitationView.id);
    expect(mockModalCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        component: ArrivalGroupComponent,
        componentProps: { invitationId: 'inv-1' },
        breakpoints: [0, 0.85, 1],
        initialBreakpoint: 0.85,
      }),
    );
  });

  it('displays singular summary when arrived and total are both 1', () => {
    expect(component.formatArrivedSummary(1, 1)).toBe('1 de 1 llegó');
    expect(component.formatArrivedSummary(0, 1)).toBe('0 de 1 llegaron');
    expect(component.formatArrivedSummary(2, 2)).toBe('2 de 2 llegaron');
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
    // Valid 10-char code that is not in session
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
      }),
    );
  });
});
