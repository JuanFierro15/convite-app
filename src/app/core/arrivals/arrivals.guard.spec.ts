import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, UrlTree } from '@angular/router';
import { firstValueFrom, isObservable } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ArrivalStoreService } from './arrival-store.service';
import { arrivalsGuard } from './arrivals.guard';

describe('arrivalsGuard', () => {
  let router: Router;
  let mockAuth: {
    ready: ReturnType<typeof signal<boolean>>;
    session: ReturnType<typeof signal<unknown>>;
    lastKnownUser: ReturnType<typeof vi.fn>;
  };
  let mockStore: {
    read: ReturnType<typeof vi.fn>;
  };

  const createRoute = (eventId: string | null): ActivatedRouteSnapshot =>
    ({
      paramMap: {
        get: (param: string) => (param === 'id' ? eventId : null),
      },
    }) as unknown as ActivatedRouteSnapshot;

  beforeEach(() => {
    mockAuth = {
      ready: signal(true),
      session: signal(null),
      lastKnownUser: vi.fn().mockResolvedValue(null),
    };

    mockStore = {
      read: vi.fn().mockResolvedValue({ snapshot: null, pending: [] }),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: ArrivalStoreService, useValue: mockStore },
      ],
    });

    router = TestBed.inject(Router);
  });

  const runGuard = async (eventId: string | null) => {
    const result = TestBed.runInInjectionContext(() =>
      arrivalsGuard(createRoute(eventId), {} as never),
    );
    if (isObservable(result)) {
      return firstValueFrom(result);
    }
    return result;
  };

  it('allows access when active session is present', async () => {
    mockAuth.session.set({ user: { id: 'user-1' } });

    const result = await runGuard('event-1');
    expect(result).toBe(true);
  });

  it('allows access without session when lastKnownUser matches saved snapshot userId', async () => {
    mockAuth.session.set(null);
    mockAuth.lastKnownUser.mockResolvedValue({
      id: 'user-1',
      email: 'organizador@convite.test',
      displayName: 'Organizador',
    });
    mockStore.read.mockResolvedValue({
      snapshot: {
        version: 1,
        eventId: 'event-1',
        userId: 'user-1',
        downloadedAt: '2026-11-29T10:00:00-05:00',
        event: { id: 'event-1', name: 'Test', theme_id: 'default', starts_at: '2026-11-29' },
        invitations: [],
      },
      pending: [],
    });

    const result = await runGuard('event-1');
    expect(result).toBe(true);
  });

  it('redirects to /login when no session and no lastKnownUser exists', async () => {
    mockAuth.session.set(null);
    mockAuth.lastKnownUser.mockResolvedValue(null);

    const result = await runGuard('event-1');
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/login');
  });

  it('redirects to /login when snapshot userId does not match lastKnownUser id', async () => {
    mockAuth.session.set(null);
    mockAuth.lastKnownUser.mockResolvedValue({
      id: 'user-1',
      email: 'organizador@convite.test',
      displayName: 'Organizador',
    });
    mockStore.read.mockResolvedValue({
      snapshot: {
        version: 1,
        eventId: 'event-1',
        userId: 'user-2', // Different user
        downloadedAt: '2026-11-29T10:00:00-05:00',
        event: { id: 'event-1', name: 'Test', theme_id: 'default', starts_at: '2026-11-29' },
        invitations: [],
      },
      pending: [],
    });

    const result = await runGuard('event-1');
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/login');
  });

  it('waits for auth.ready() before evaluating if initially not ready', async () => {
    mockAuth.ready.set(false);
    mockAuth.session.set({ user: { id: 'user-1' } });

    const guardPromise = runGuard('event-1');

    mockAuth.ready.set(true);
    const result = await guardPromise;
    expect(result).toBe(true);
  });
});
