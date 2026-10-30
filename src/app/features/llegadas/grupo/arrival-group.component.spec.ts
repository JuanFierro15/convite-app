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
        message: 'No respondió la invitación. ¿Registrar su llegada de todas formas?',
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

  it('renders "Sin respuesta" in summary and per guest when all guests are pending', async () => {
    const pendingGuests: ArrivalGuestView[] = [
      { id: 'g-1', full_name: 'Persona Uno', rsvp: 'pending', arrivedAt: null, synced: true },
      { id: 'g-2', full_name: 'Persona Dos', rsvp: 'pending', arrivedAt: null, synced: true },
    ];
    mockSession.invitations.set([
      { ...sampleInvitation, id: 'inv-pending', guests: pendingGuests, arrivedCount: 0, totalCount: 2 },
    ]);
    component.invitationId = 'inv-pending';
    fixture.detectChanges();
    await fixture.whenStable();

    const summaryEl = fixture.nativeElement.querySelector('.rsvp-summary');
    expect(summaryEl?.textContent).toContain('Sin respuesta');

    const guestBadges = fixture.nativeElement.querySelectorAll('.guest-item app-status-badge');
    expect(guestBadges.length).toBe(2);
    for (const badge of guestBadges) {
      expect(badge.textContent).toContain('Sin respuesta');
    }
  });

  it('renders "Confirmaron 3 de 3" in summary and "Confirmó" per guest when all are accepted', async () => {
    const acceptedGuests: ArrivalGuestView[] = [
      { id: 'g-1', full_name: 'Persona Uno', rsvp: 'accepted', arrivedAt: null, synced: true },
      { id: 'g-2', full_name: 'Persona Dos', rsvp: 'accepted', arrivedAt: null, synced: true },
      { id: 'g-3', full_name: 'Persona Tres', rsvp: 'accepted', arrivedAt: null, synced: true },
    ];
    mockSession.invitations.set([
      { ...sampleInvitation, id: 'inv-all-acc', guests: acceptedGuests, arrivedCount: 0, totalCount: 3 },
    ]);
    component.invitationId = 'inv-all-acc';
    fixture.detectChanges();
    await fixture.whenStable();

    const summaryEl = fixture.nativeElement.querySelector('.rsvp-summary');
    expect(summaryEl?.textContent).toContain('Confirmaron 3 de 3');

    const guestBadges = fixture.nativeElement.querySelectorAll('.guest-item app-status-badge');
    expect(guestBadges.length).toBe(3);
    for (const badge of guestBadges) {
      expect(badge.textContent).toContain('Confirmó');
    }
  });

  it('renders "No asistirán" in summary and "No asistirá" per guest when all are declined', async () => {
    const declinedGuests: ArrivalGuestView[] = [
      { id: 'g-1', full_name: 'Persona Uno', rsvp: 'declined', arrivedAt: null, synced: true },
      { id: 'g-2', full_name: 'Persona Dos', rsvp: 'declined', arrivedAt: null, synced: true },
    ];
    mockSession.invitations.set([
      { ...sampleInvitation, id: 'inv-all-dec', guests: declinedGuests, arrivedCount: 0, totalCount: 2 },
    ]);
    component.invitationId = 'inv-all-dec';
    fixture.detectChanges();
    await fixture.whenStable();

    const summaryEl = fixture.nativeElement.querySelector('.rsvp-summary');
    expect(summaryEl?.textContent).toContain('No asistirán');

    const guestBadges = fixture.nativeElement.querySelectorAll('.guest-item app-status-badge');
    expect(guestBadges.length).toBe(2);
    for (const badge of guestBadges) {
      expect(badge.textContent).toContain('No asistirá');
    }
  });

  it('renders "Confirmaron X de N" in summary for mixed responses', async () => {
    const mixedGuests: ArrivalGuestView[] = [
      { id: 'g-1', full_name: 'Persona Uno', rsvp: 'accepted', arrivedAt: null, synced: true },
      { id: 'g-2', full_name: 'Persona Dos', rsvp: 'pending', arrivedAt: null, synced: true },
      { id: 'g-3', full_name: 'Persona Tres', rsvp: 'declined', arrivedAt: null, synced: true },
    ];
    mockSession.invitations.set([
      { ...sampleInvitation, id: 'inv-mixed', guests: mixedGuests, arrivedCount: 0, totalCount: 3 },
    ]);
    component.invitationId = 'inv-mixed';
    fixture.detectChanges();
    await fixture.whenStable();

    const summaryEl = fixture.nativeElement.querySelector('.rsvp-summary');
    expect(summaryEl?.textContent).toContain('Confirmaron 1 de 3');
  });

  it('handles offline scan with null rsvp in cache: shows Sin respuesta, does not preselect, and confirms with proper message', async () => {
    const nullRsvpGuests = [
      { id: 'g-null-1', full_name: 'Persona Null 1', rsvp: null as any, arrivedAt: null, synced: true },
      { id: 'g-null-2', full_name: 'Persona Null 2', rsvp: null as any, arrivedAt: null, synced: true },
    ];
    mockSession.invitations.set([
      { ...sampleInvitation, id: 'inv-null-cache', guests: nullRsvpGuests as ArrivalGuestView[], arrivedCount: 0, totalCount: 2 },
    ]);

    const newFixture = TestBed.createComponent(ArrivalGroupComponent);
    const newComp = newFixture.componentInstance;
    newComp.invitationId = 'inv-null-cache';
    newFixture.detectChanges();
    await newFixture.whenStable();

    const summaryEl = newFixture.nativeElement.querySelector('.rsvp-summary');
    expect(summaryEl?.textContent).toContain('Sin respuesta');

    const guestBadges = newFixture.nativeElement.querySelectorAll('.guest-item app-status-badge');
    for (const badge of guestBadges) {
      expect(badge.textContent).toContain('Sin respuesta');
    }

    expect(newComp.pendingSelectedCount()).toBe(0);

    const alertMock = {
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockResolvedValue({ role: 'confirm' }),
    };
    mockAlertCtrl.create.mockResolvedValue(alertMock);

    await newComp.onToggleGuest(
      nullRsvpGuests[0] as any,
      new CustomEvent('ionChange', { detail: { checked: true } }),
    );

    expect(mockAlertCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'No respondió la invitación. ¿Registrar su llegada de todas formas?',
      }),
    );
  });

  it('prompts confirmation when checking a declined guest and registers after confirmation', async () => {
    const declinedGuest: ArrivalGuestView = {
      id: 'g-dec',
      full_name: 'Persona Rechazada',
      rsvp: 'declined',
      arrivedAt: null,
      synced: true,
    };
    mockSession.invitations.set([
      { ...sampleInvitation, id: 'inv-declined', guests: [declinedGuest], arrivedCount: 0, totalCount: 1 },
    ]);
    mockSession.register.mockResolvedValue(1);

    const newFixture = TestBed.createComponent(ArrivalGroupComponent);
    const newComp = newFixture.componentInstance;
    newComp.invitationId = 'inv-declined';
    newFixture.detectChanges();
    await newFixture.whenStable();

    const alertMock = {
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockResolvedValue({ role: 'confirm' }),
    };
    mockAlertCtrl.create.mockResolvedValue(alertMock);

    await newComp.onToggleGuest(
      declinedGuest,
      new CustomEvent('ionChange', { detail: { checked: true } }),
    );

    expect(mockAlertCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Dijo que no asistiría. ¿Registrar su llegada de todas formas?',
        buttons: expect.arrayContaining([
          expect.objectContaining({ text: 'Cancelar', role: 'cancel' }),
          expect.objectContaining({ text: 'Registrar', role: 'confirm' }),
        ]),
      }),
    );
    expect(newComp.isGuestSelected(declinedGuest.id)).toBe(true);

    await newComp.onRegister();
    expect(mockSession.register).toHaveBeenCalledWith('inv-declined', [declinedGuest.id]);
  });
});
