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
    queuedCount: 0,
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
    expect(component.selectedGuestIds()).toEqual(['guest-1']);
    expect(component.pendingSelectedCount()).toBe(1);
  });

  it('does not re-initialize selection when invitation list updates later', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    component.selectedGuestIds.set([]);
    expect(component.selectedGuestIds()).toEqual([]);

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
        cssClass: 'convite-alert',
        buttons: [
          {
            text: 'Cancelar',
            role: 'cancel',
            cssClass: 'convite-alert__cancel',
          },
          {
            text: 'Deshacer',
            role: 'confirm',
            cssClass: 'convite-alert__confirm',
          },
        ],
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
        positionAnchor: 'arrival-group-footer',
      }),
    );
  });

  it('toggles accepted guest directly without confirmation alert', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    await component.onToggleGuest(
      sampleGuests[0],
      new CustomEvent('ionChange', { detail: { checked: false } }),
    );
    expect(component.isGuestSelected(sampleGuests[0].id)).toBe(false);

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
        header: sampleGuests[3].full_name,
        message: 'No respondió la invitación. ¿Registrar su llegada de todas formas?',
        cssClass: 'convite-alert',
        buttons: [
          {
            text: 'Cancelar',
            role: 'cancel',
            cssClass: 'convite-alert__cancel',
          },
          {
            text: 'Registrar llegada',
            role: 'confirm',
            cssClass: 'convite-alert__confirm',
          },
        ],
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
        message: 'Llegada registrada: Familia Ejemplo, 1 persona',
        color: 'success',
      }),
    );
    expect(mockToastCtrl.create.mock.calls[0][0].positionAnchor).toBeUndefined();
    expect(mockModalCtrl.dismiss).toHaveBeenCalledWith(null, 'registered');
  });

  it('displays plural in success toast when multiple arrivals registered', async () => {
    mockSession.register.mockResolvedValue(2);

    fixture.detectChanges();
    await fixture.whenStable();

    component.selectedGuestIds.set(['guest-1', 'guest-4']);

    await component.onRegister();

    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Llegada registrada: Familia Ejemplo, 2 personas',
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
        positionAnchor: 'arrival-group-footer',
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
        header: nullRsvpGuests[0].full_name,
        message: 'No respondió la invitación. ¿Registrar su llegada de todas formas?',
        cssClass: 'convite-alert',
        buttons: [
          {
            text: 'Cancelar',
            role: 'cancel',
            cssClass: 'convite-alert__cancel',
          },
          {
            text: 'Registrar llegada',
            role: 'confirm',
            cssClass: 'convite-alert__confirm',
          },
        ],
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
        header: declinedGuest.full_name,
        message: 'Dijo que no asistiría. ¿Registrar su llegada de todas formas?',
        cssClass: 'convite-alert',
        buttons: [
          {
            text: 'Cancelar',
            role: 'cancel',
            cssClass: 'convite-alert__cancel',
          },
          {
            text: 'Registrar llegada',
            role: 'confirm',
            cssClass: 'convite-alert__confirm',
          },
        ],
      }),
    );
    expect(newComp.isGuestSelected(declinedGuest.id)).toBe(true);

    await newComp.onRegister();
    expect(mockSession.register).toHaveBeenCalledWith('inv-declined', [declinedGuest.id]);
  });

  it('unselects a preselected accepted guest when clicking row content, and selects again on second click', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const items = fixture.nativeElement.querySelectorAll('.guest-item');
    const guest1Item = items[0] as HTMLElement;
    const contentEl = guest1Item.querySelector('.guest-item__content') as HTMLElement;
    const checkboxEl = guest1Item.querySelector('ion-checkbox') as any;

    expect(component.isGuestSelected('guest-1')).toBe(true);
    expect(checkboxEl.checked).toBe(true);

    contentEl.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.isGuestSelected('guest-1')).toBe(false);
    expect(checkboxEl.checked).toBe(false);

    contentEl.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.isGuestSelected('guest-1')).toBe(true);
    expect(checkboxEl.checked).toBe(true);
  });

  it('prompts confirmation when clicking row content of an unconfirmed guest: selects with confirm, stays unselected with cancel', async () => {
    const alertMockConfirm = {
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockResolvedValue({ role: 'confirm' }),
    };
    mockAlertCtrl.create.mockResolvedValue(alertMockConfirm);

    fixture.detectChanges();
    await fixture.whenStable();

    const items = fixture.nativeElement.querySelectorAll('.guest-item');
    const guest4Item = items[3] as HTMLElement;
    const contentEl = guest4Item.querySelector('.guest-item__content') as HTMLElement;
    const checkboxEl = guest4Item.querySelector('ion-checkbox') as any;

    contentEl.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(mockAlertCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        header: sampleGuests[3].full_name,
        message: 'No respondió la invitación. ¿Registrar su llegada de todas formas?',
        cssClass: 'convite-alert',
        buttons: [
          {
            text: 'Cancelar',
            role: 'cancel',
            cssClass: 'convite-alert__cancel',
          },
          {
            text: 'Registrar llegada',
            role: 'confirm',
            cssClass: 'convite-alert__confirm',
          },
        ],
      }),
    );
    expect(component.isGuestSelected('guest-4')).toBe(true);
    expect(checkboxEl.checked).toBe(true);

    component.selectedGuestIds.set(['guest-1']);
    checkboxEl.checked = false;
    fixture.detectChanges();
    await fixture.whenStable();

    const alertMockCancel = {
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockResolvedValue({ role: 'cancel' }),
    };
    mockAlertCtrl.create.mockResolvedValue(alertMockCancel);

    contentEl.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.isGuestSelected('guest-4')).toBe(false);
    expect(checkboxEl.checked).toBe(false);
  });

  it('toggles selection exactly once when checkbox emits ionChange and does not trigger row click', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const items = fixture.nativeElement.querySelectorAll('.guest-item');
    const guest1Item = items[0] as HTMLElement;
    const checkboxEl = guest1Item.querySelector('ion-checkbox') as HTMLElement;

    const rowSpy = vi.spyOn(component, 'onRowContentClick');

    checkboxEl.dispatchEvent(new CustomEvent('ionChange', { detail: { checked: false }, bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(rowSpy).not.toHaveBeenCalled();
    expect(component.isGuestSelected('guest-1')).toBe(false);

    checkboxEl.dispatchEvent(new CustomEvent('ionChange', { detail: { checked: true }, bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(rowSpy).not.toHaveBeenCalled();
    expect(component.isGuestSelected('guest-1')).toBe(true);
  });

  it('does not trigger row content click when click event is dispatched on ion-item itself', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const items = fixture.nativeElement.querySelectorAll('.guest-item');
    const guest1Item = items[0] as HTMLElement;

    const rowSpy = vi.spyOn(component, 'onRowContentClick');
    const toggleSpy = vi.spyOn(component, 'toggleGuest');

    const clickEvent = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(clickEvent, 'target', { value: guest1Item });
    guest1Item.dispatchEvent(clickEvent);

    expect(rowSpy).not.toHaveBeenCalled();
    expect(toggleSpy).not.toHaveBeenCalled();
    expect(component.isGuestSelected('guest-1')).toBe(true);
  });

  it('does not toggle selection when clicking undo button', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const items = fixture.nativeElement.querySelectorAll('.guest-item');
    const guest2Item = items[1] as HTMLElement;
    const undoButton = guest2Item.querySelector('.undo-button') as HTMLElement;

    const toggleSpy = vi.spyOn(component, 'toggleGuest');
    const onUndoSpy = vi.spyOn(component, 'onUndo').mockImplementation(async () => {});

    undoButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(onUndoSpy).toHaveBeenCalled();
    expect(toggleSpy).not.toHaveBeenCalled();
    expect(component.isGuestSelected('guest-2')).toBe(false);
  });

  it('does not toggle selection when clicking row content of an already arrived guest', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const items = fixture.nativeElement.querySelectorAll('.guest-item');
    const guest2Item = items[1] as HTMLElement;
    const contentEl = guest2Item.querySelector('.guest-item__content') as HTMLElement;

    const toggleSpy = vi.spyOn(component, 'toggleGuest');

    contentEl.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(toggleSpy).not.toHaveBeenCalled();
    expect(component.isGuestSelected('guest-2')).toBe(false);
    expect(mockAlertCtrl.create).not.toHaveBeenCalled();
  });

  it('sets accessible aria-label on checkboxes for pending guests', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const items = fixture.nativeElement.querySelectorAll('.guest-item');
    const guest1Checkbox = items[0].querySelector('ion-checkbox') as HTMLElement;
    const guest4Checkbox = items[3].querySelector('ion-checkbox') as HTMLElement;

    expect(guest1Checkbox.getAttribute('aria-label')).toBe('Registrar llegada de Persona Aceptada Pendiente');
    expect(guest4Checkbox.getAttribute('aria-label')).toBe('Registrar llegada de Persona No Confirmada');
  });

  it('ignores touches on the same row while confirmation alert is already open', async () => {
    let resolveDismiss!: (value: { role: string }) => void;
    const dismissPromise = new Promise<{ role: string }>((resolve) => {
      resolveDismiss = resolve;
    });

    const alertMock = {
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockReturnValue(dismissPromise),
    };
    mockAlertCtrl.create.mockResolvedValue(alertMock);

    fixture.detectChanges();
    await fixture.whenStable();

    const items = fixture.nativeElement.querySelectorAll('.guest-item');
    const guest4Item = items[3] as HTMLElement;
    const contentEl = guest4Item.querySelector('.guest-item__content') as HTMLElement;

    const firstClick = component.onRowContentClick(sampleGuests[3], {
      target: contentEl,
      currentTarget: contentEl,
    } as unknown as Event);

    await component.onRowContentClick(sampleGuests[3], {
      target: contentEl,
      currentTarget: contentEl,
    } as unknown as Event);

    expect(mockAlertCtrl.create).toHaveBeenCalledTimes(1);

    resolveDismiss({ role: 'confirm' });
    await firstClick;

    expect(component.isGuestSelected('guest-4')).toBe(true);
  });

  it('displays individual guest name in success toast for individual invitation without positionAnchor', async () => {
    const individualGuest: ArrivalGuestView = {
      id: 'guest-ind-1',
      full_name: 'Ana Ejemplo',
      rsvp: 'accepted',
      arrivedAt: null,
      synced: true,
    };
    const individualInvitation: ArrivalInvitationView = {
      id: 'inv-ind-1',
      code: 'IND1234567',
      group_name: 'Ana Ejemplo',
      kind: 'individual',
      guests: [individualGuest],
      arrivedCount: 0,
      totalCount: 1,
      queuedCount: 0,
    };
    mockSession.invitations.set([individualInvitation]);
    mockSession.register.mockResolvedValue(1);

    const indFixture = TestBed.createComponent(ArrivalGroupComponent);
    const indComp = indFixture.componentInstance;
    indComp.invitationId = 'inv-ind-1';
    indFixture.detectChanges();
    await indFixture.whenStable();

    await indComp.onRegister();

    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Llegada registrada: Ana Ejemplo',
        color: 'success',
      }),
    );
    expect(mockToastCtrl.create.mock.calls[0][0].positionAnchor).toBeUndefined();
    expect(mockModalCtrl.dismiss).toHaveBeenCalledWith(null, 'registered');
  });
});
