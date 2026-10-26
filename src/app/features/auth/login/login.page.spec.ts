import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Router } from '@angular/router';
import {
  ArrivalSnapshot,
  ArrivalStoreService,
  AuthService,
  ThemeService,
} from '../../../core';
import { LoginPage } from './login.page';

const mockSnapshot1: ArrivalSnapshot = {
  version: 1,
  eventId: 'event-offline-1',
  userId: 'user-offline-1',
  downloadedAt: '2026-10-25T10:00:00-05:00',
  event: {
    id: 'event-offline-1',
    name: 'Baby Shower Ejemplo',
    theme_id: 'baby-shower',
    starts_at: '2026-11-29T15:00:00-05:00',
  },
  invitations: [],
};

const mockSnapshotOtherUser: ArrivalSnapshot = {
  version: 1,
  eventId: 'event-offline-2',
  userId: 'different-user',
  downloadedAt: '2026-10-24T10:00:00-05:00',
  event: {
    id: 'event-offline-2',
    name: 'Otro Evento',
    theme_id: 'baby-shower',
    starts_at: '2026-11-29T15:00:00-05:00',
  },
  invitations: [],
};

describe('LoginPage - Offline Arrivals Access', () => {
  let fixture: ComponentFixture<LoginPage>;
  let component: LoginPage;
  let mockAuth: {
    ready: ReturnType<typeof signal<boolean>>;
    session: ReturnType<typeof signal<unknown>>;
    lastKnownUser: ReturnType<typeof vi.fn>;
    signIn: ReturnType<typeof vi.fn>;
  };
  let mockStore: {
    listSnapshots: ReturnType<typeof vi.fn>;
  };
  let mockTheme: {
    apply: ReturnType<typeof vi.fn>;
    asset: ReturnType<typeof vi.fn>;
  };
  let router: Router;

  beforeEach(async () => {
    mockAuth = {
      ready: signal(true),
      session: signal(null),
      lastKnownUser: vi.fn().mockResolvedValue({
        id: 'user-offline-1',
        email: 'organizador@convite.test',
        displayName: 'Organizador',
      }),
      signIn: vi.fn(),
    };
    mockStore = {
      listSnapshots: vi.fn().mockResolvedValue([mockSnapshot1, mockSnapshotOtherUser]),
    };
    mockTheme = {
      apply: vi.fn(),
      asset: vi.fn().mockReturnValue('mock-logo.png'),
    };

    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuth },
        { provide: ArrivalStoreService, useValue: mockStore },
        { provide: ThemeService, useValue: mockTheme },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(LoginPage);
    component = fixture.componentInstance;
  });

  it('redirects to /eventos if session is already present', async () => {
    mockAuth.session.set({ user: { id: 'user-offline-1' } });

    await component.ionViewWillEnter();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/eventos', { replaceUrl: true });
    expect(mockStore.listSnapshots).not.toHaveBeenCalled();
    expect(component.offlineSnapshots()).toEqual([]);
  });

  it('loads and filters snapshots for the last known user when there is no session', async () => {
    await component.ionViewWillEnter();
    fixture.detectChanges();

    expect(component.offlineSnapshots()).toEqual([mockSnapshot1]);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('¿Sin conexión?');
    expect(element.textContent).toContain('Registrar llegadas de Baby Shower Ejemplo');
  });

  it('does not display offline card if there are no snapshots matching the last known user', async () => {
    mockStore.listSnapshots.mockResolvedValue([mockSnapshotOtherUser]);

    await component.ionViewWillEnter();
    fixture.detectChanges();

    expect(component.offlineSnapshots()).toEqual([]);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).not.toContain('¿Sin conexión?');
  });
});
