import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AlertController, ModalController, ToastController } from '@ionic/angular';
import { Haptics, NotificationType } from '@capacitor/haptics';
import {
  ArrivalGuestView,
  ArrivalInvitationView,
  ArrivalSessionService,
} from '../../../core';
import { ArrivalGroupComponent } from './arrival-group.component';

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

describe('ArrivalGroupComponent', () => {
  let fixture: ComponentFixture<ArrivalGroupComponent>;
  let component: ArrivalGroupComponent;
  let mockSession: {
    invitations: ReturnType<typeof signal<ArrivalInvitationView[]>>;
    register: ReturnType<typeof vi.fn>;
    undo: ReturnType<typeof vi.fn>;
  };
  let mockModalCtrl: { dismiss: ReturnType<typeof vi.fn> };
  let mockAlertCtrl: { create: ReturnType<typeof vi.fn> };
  let mockToastCtrl: { create: ReturnType<typeof vi.fn> };

  const sampleGuests: ArrivalGuestView[] = [
    {
      id: 'guest-1',
      full_name: 'Persona Aceptada Pendiente',
      rsvp: 'accepted',
      arrivedAt: null,
      synced: true,
    },
    {
      id: 'guest-2',
      full_name: 'Persona Ya Llegada Sincronizada',
      rsvp: 'accepted',
      arrivedAt: '2026-11-29T15:30:00-05:00',
      synced: true,
    },
    {
      id: 'guest-3',
      full_name: 'Persona Ya Llegada Sin Sincronizar',
      rsvp: 'accepted',
      arrivedAt: '2026-11-29T15:45:00-05:00',
      synced: false,
    },
    {
      id: 'guest-4',
      full_name: 'Persona No Confirmada',
      rsvp: 'pending',
      arrivedAt: null,
      synced: true,
    },
  ];

  const sampleInvitation: ArrivalInvitationView = {
    id: 'inv-1',
    code: 'ABC2345678',
    group_name: 'Familia Ejemplo',
    kind: 'group',
    guests: sampleGuests,
    arrivedCount: 2,
    totalCount: 4,
  };

  beforeEach(async () => {
    mockSession = {
      invitations: signal<ArrivalInvitationView[]>([sampleInvitation]),
      register: vi.fn().mockResolvedValue(1),
      undo: vi.fn().mockResolvedValue(undefined),
    };

    mockModalCtrl = {
      dismiss: vi.fn().mockResolvedValue(true),
    };

    mockAlertCtrl = {
      create: vi.fn(),
    };

    mockToastCtrl = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
      }),
    };

    await TestBed.configureTestingModule({
      imports: [ArrivalGroupComponent],
      providers: [
        { provide: ArrivalSessionService, useValue: mockSession },
        { provide: ModalController, useValue: mockModalCtrl },
        { provide: AlertController, useValue: mockAlertCtrl },
        { provide: ToastController, useValue: mockToastCtrl },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ArrivalGroupComponent);
    component = fixture.componentInstance;
    component.invitationId = 'inv-1';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('initializes invitation, formatted code, and default selection', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.invitation()?.id).toBe('inv-1');
    expect(component.formattedCode()).toBe('ABC2-3456-78');
    // Only guest-1 is accepted and has not arrived yet
    expect(component.selectedGuestIds()).toEqual(['guest-1']);
    expect(component.pendingSelectedCount()).toBe(1);
  });

  it('does not re-initialize selection when invitation list updates later', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    // User unselects guest-1
    component.selectedGuestIds.set([]);
    expect(component.selectedGuestIds()).toEqual([]);

    // Session emits updated invitations
    mockSession.invitations.set([{ ...sampleInvitation }]);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.selectedGuestIds()).toEqual([]);
  });

  it('renders arrived text and indicates unsynced arrivals', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    const textContent = element.textContent ?? '';

    expect(textContent).toContain('Llegó a las');
    expect(textContent).toContain('sin sincronizar');
  });

  it('prompts confirmation before undoing an arrival', async () => {
    const alertMock = {
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockResolvedValue({ role: 'confirm' }),
    };
    mockAlertCtrl.create.mockResolvedValue(alertMock);

    fixture.detectChanges();
    await fixture.whenStable();

    const guestToUndo = sampleGuests[1]; // already arrived
    await component.onUndo(guestToUndo);

    expect(mockAlertCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        header: `¿Deshacer la llegada de ${guestToUndo.full_name}?`,
        buttons: expect.arrayContaining([
          expect.objectContaining({ text: 'Cancelar', role: 'cancel' }),
          expect.objectContaining({ text: 'Deshacer', role: 'confirm' }),
        ]),
      }),
    );
    expect(mockSession.undo).toHaveBeenCalledWith(guestToUndo.id);
  });

  it('does not undo if user cancels confirmation alert', async () => {
    const alertMock = {
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockResolvedValue({ role: 'cancel' }),
    };
    mockAlertCtrl.create.mockResolvedValue(alertMock);

    fixture.detectChanges();
    await fixture.whenStable();

    await component.onUndo(sampleGuests[1]);

    expect(mockSession.undo).not.toHaveBeenCalled();
  });

  it('shows error toast when undo fails', async () => {
    const alertMock = {
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockResolvedValue({ role: 'confirm' }),
    };
    mockAlertCtrl.create.mockResolvedValue(alertMock);
    mockSession.undo.mockRejectedValue(new Error('Fallo de conexión'));

    fixture.detectChanges();
    await fixture.whenStable();

    await component.onUndo(sampleGuests[1]);

    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Fallo de conexión',
        color: 'danger',
      }),
    );
  });

  it('toggles accepted guest directly without confirmation alert', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    // guest-1 is already selected initially. Unselect it:
    await component.onToggleGuest(
      sampleGuests[0],
      new CustomEvent('ionChange', { detail: { checked: false } }),
    );
    expect(component.isGuestSelected(sampleGuests[0].id)).toBe(false);

    // Re-select it:
    await component.onToggleGuest(
      sampleGuests[0],
      new CustomEvent('ionChange', { detail: { checked: true } }),
    );
    expect(component.isGuestSelected(sampleGuests[0].id)).toBe(true);
    expect(mockAlertCtrl.create).not.toHaveBeenCalled();
  });

  it('prompts confirmation when checking an unconfirmed guest', async () => {
    const alertMock = {
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockResolvedValue({ role: 'confirm' }),
    };
    mockAlertCtrl.create.mockResolvedValue(alertMock);

    fixture.detectChanges();
    await fixture.whenStable();

    const unconfirmedGuest = sampleGuests[3]; // pending rsvp
    await component.onToggleGuest(
      unconfirmedGuest,
      new CustomEvent('ionChange', { detail: { checked: true } }),
    );

    expect(mockAlertCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'No confirmó asistencia, ¿registrar de todas formas?',
        buttons: expect.arrayContaining([
          expect.objectContaining({ text: 'Cancelar', role: 'cancel' }),
          expect.objectContaining({ text: 'Registrar', role: 'confirm' }),
        ]),
      }),
    );
    expect(component.isGuestSelected(unconfirmedGuest.id)).toBe(true);
  });

  it('reverts checkbox when user cancels unconfirmed guest confirmation', async () => {
    const alertMock = {
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockResolvedValue({ role: 'cancel' }),
    };
    mockAlertCtrl.create.mockResolvedValue(alertMock);

    fixture.detectChanges();
    await fixture.whenStable();

    const fakeCheckbox = { checked: true } as HTMLIonCheckboxElement;
    const event = new CustomEvent('ionChange', { detail: { checked: true } });
    Object.defineProperty(event, 'target', { value: fakeCheckbox });

    const unconfirmedGuest = sampleGuests[3];
    await component.onToggleGuest(unconfirmedGuest, event);

    expect(fakeCheckbox.checked).toBe(false);
    expect(component.isGuestSelected(unconfirmedGuest.id)).toBe(false);
  });

  it('registers arrival, vibrates success, shows success toast, and closes modal', async () => {
    mockSession.register.mockResolvedValue(1);

    fixture.detectChanges();
    await fixture.whenStable();

    await component.onRegister();

    expect(mockSession.register).toHaveBeenCalledWith('inv-1', ['guest-1']);
    expect(Haptics.notification).toHaveBeenCalledWith({ type: NotificationType.Success });
    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Llegada registrada: 1 persona',
        color: 'success',
      }),
    );
    expect(mockModalCtrl.dismiss).toHaveBeenCalledWith(null, 'registered');
  });

  it('displays plural in success toast when multiple arrivals registered', async () => {
    mockSession.register.mockResolvedValue(2);

    fixture.detectChanges();
    await fixture.whenStable();

    // Add another guest to selection
    component.selectedGuestIds.set(['guest-1', 'guest-4']);

    await component.onRegister();

    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Llegada registrada: 2 personas',
        color: 'success',
      }),
    );
  });

  it('tells that the guests were already registered when no new arrival is added', async () => {
    mockSession.register.mockResolvedValue(0);

    fixture.detectChanges();
    await fixture.whenStable();

    await component.onRegister();

    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Estas personas ya estaban registradas',
      }),
    );
    expect(mockToastCtrl.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Llegada registrada: 0 personas',
      }),
    );
  });

  it('shows danger toast and leaves modal open when register fails', async () => {
    mockSession.register.mockRejectedValue(new Error('Error al registrar'));

    fixture.detectChanges();
    await fixture.whenStable();

    await component.onRegister();

    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Error al registrar',
        color: 'danger',
      }),
    );
    expect(mockModalCtrl.dismiss).not.toHaveBeenCalled();
    expect(component.saving()).toBe(false);
  });

  it('shows all arrived message and close button when everyone has arrived', async () => {
    const allArrivedInvitation: ArrivalInvitationView = {
      ...sampleInvitation,
      guests: sampleGuests.map((g) => ({ ...g, arrivedAt: '2026-11-29T15:00:00-05:00' })),
    };
    mockSession.invitations.set([allArrivedInvitation]);

    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.allArrived()).toBe(true);

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain(
      'Todas las personas de esta invitación ya llegaron.',
    );

    await component.close();
    expect(mockModalCtrl.dismiss).toHaveBeenCalled();
  });
});
