import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import {
  ArrivalStoreService,
  AuthService,
  EventsRepository,
} from '../../../core';
import { EventListPage } from './event-list.page';

describe('EventListPage', () => {
  let fixture: ComponentFixture<EventListPage>;
  let component: EventListPage;
  let mockAuth: {
    ready: ReturnType<typeof signal<boolean>>;
    session: ReturnType<typeof signal<unknown>>;
    displayName: ReturnType<typeof signal<string>>;
    signOut: ReturnType<typeof vi.fn>;
  };
  let mockStore: {
    pendingTotal: ReturnType<typeof vi.fn>;
    clearAll: ReturnType<typeof vi.fn>;
  };
  let mockAlertCtrl: {
    create: ReturnType<typeof vi.fn>;
  };
  let mockEventsRepo: {
    listMine: ReturnType<typeof vi.fn>;
  };
  let mockRouter: {
    navigateByUrl: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockAuth = {
      ready: signal(true),
      session: signal({ user: { id: 'user-test-1' } }),
      displayName: signal('Organizador Ejemplo'),
      signOut: vi.fn().mockResolvedValue(undefined),
    };
    mockStore = {
      pendingTotal: vi.fn().mockResolvedValue(0),
      clearAll: vi.fn().mockResolvedValue(undefined),
    };
    mockAlertCtrl = {
      create: vi.fn(),
    };
    mockEventsRepo = {
      listMine: vi.fn().mockResolvedValue([]),
    };
    mockRouter = {
      navigateByUrl: vi.fn().mockResolvedValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [EventListPage],
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: ArrivalStoreService, useValue: mockStore },
        { provide: AlertController, useValue: mockAlertCtrl },
        { provide: EventsRepository, useValue: mockEventsRepo },
        { provide: Router, useValue: mockRouter },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EventListPage);
    component = fixture.componentInstance;
  });

  describe('header and greeting', () => {
    it('displays "Eventos" in ion-title', () => {
      fixture.detectChanges();
      const title = fixture.nativeElement.querySelector('ion-title');
      expect(title?.textContent?.trim()).toBe('Eventos');
    });

    it('displays "Hola, Organizador Ejemplo" in h1.event-list__greeting when displayName is present', () => {
      mockAuth.displayName.set('Organizador Ejemplo');
      fixture.detectChanges();
      const greeting = fixture.nativeElement.querySelector('h1.event-list__greeting');
      expect(greeting?.textContent?.trim()).toBe('Hola, Organizador Ejemplo');
    });

    it('displays "Hola" in h1.event-list__greeting when displayName is empty', () => {
      mockAuth.displayName.set('');
      fixture.detectChanges();
      const greeting = fixture.nativeElement.querySelector('h1.event-list__greeting');
      expect(greeting?.textContent?.trim()).toBe('Hola');
    });
  });

  describe('signOut', () => {

  it('signs out directly when there are 0 pending arrivals', async () => {
    mockStore.pendingTotal.mockResolvedValue(0);

    await component.signOut();

    expect(mockAlertCtrl.create).not.toHaveBeenCalled();
    expect(mockStore.clearAll).toHaveBeenCalled();
    expect(mockAuth.signOut).toHaveBeenCalled();
    expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/login', { replaceUrl: true });
  });

  it('shows confirmation alert with singular message when 1 pending arrival exists and proceeds if confirmed', async () => {
    mockStore.pendingTotal.mockResolvedValue(1);
    const mockAlert = {
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockResolvedValue({ role: 'destructive' }),
    };
    mockAlertCtrl.create.mockResolvedValue(mockAlert);

    await component.signOut();

    expect(mockAlertCtrl.create).toHaveBeenCalledWith({
      header: 'Llegadas sin sincronizar',
      message: 'Hay 1 llegada sin sincronizar en este celular. Si cierras sesión ahora, se perderá.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Cerrar sesión', role: 'destructive' },
      ],
    });
    expect(mockAlert.present).toHaveBeenCalled();
    expect(mockStore.clearAll).toHaveBeenCalled();
    expect(mockAuth.signOut).toHaveBeenCalled();
    expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/login', { replaceUrl: true });
  });

  it('shows confirmation alert with plural message when multiple pending arrivals exist and stops if cancelled', async () => {
    mockStore.pendingTotal.mockResolvedValue(3);
    const mockAlert = {
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockResolvedValue({ role: 'cancel' }),
    };
    mockAlertCtrl.create.mockResolvedValue(mockAlert);

    await component.signOut();

    expect(mockAlertCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        header: 'Llegadas sin sincronizar',
        message: 'Hay 3 llegadas sin sincronizar en este celular. Si cierras sesión ahora, se perderán.',
      }),
    );
    expect(mockAlert.present).toHaveBeenCalled();
    expect(mockStore.clearAll).not.toHaveBeenCalled();
    expect(mockAuth.signOut).not.toHaveBeenCalled();
    expect(mockRouter.navigateByUrl).not.toHaveBeenCalled();
  });
  });
});
