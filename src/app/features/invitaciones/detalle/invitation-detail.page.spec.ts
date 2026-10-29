import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AlertController, ModalController } from '@ionic/angular';
import {
  AuthService,
  EventContextService,
  EventRole,
  EventRow,
  InvitationWithGuests,
  InvitationsRepository,
  RealtimeService,
} from '../../../core';
import { InvitationActionsService } from '../invitation-actions.service';
import { InvitationFormComponent } from '../formulario/invitation-form.component';
import { InvitationDetailPage } from './invitation-detail.page';

describe('InvitationDetailPage', () => {
  let fixture: ComponentFixture<InvitationDetailPage>;
  let component: InvitationDetailPage;
  let mockModalCtrl: { create: ReturnType<typeof vi.fn> };
  let mockModal: { present: ReturnType<typeof vi.fn>; onDidDismiss: ReturnType<typeof vi.fn> };
  let mockAlertCtrl: { create: ReturnType<typeof vi.fn> };
  let mockAlert: { present: ReturnType<typeof vi.fn>; onDidDismiss: ReturnType<typeof vi.fn> };
  let mockEventContext: {
    event: ReturnType<typeof signal<EventRow | null>>;
    role: ReturnType<typeof signal<EventRole | null>>;
    isOwner: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    loading: ReturnType<typeof signal<boolean>>;
    load: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
  let mockInvitationsRepo: {
    get: ReturnType<typeof vi.fn>;
    setGuestRsvp: ReturnType<typeof vi.fn>;
    clearWhatsAppSent: ReturnType<typeof vi.fn>;
  };
  let mockAuth: {
    ready: ReturnType<typeof signal<boolean>>;
    session: ReturnType<typeof signal<unknown>>;
  };
  let mockRealtime: {
    watch: ReturnType<typeof vi.fn>;
  };
  let mockInvitationActions: {
    confirmDelete: ReturnType<typeof vi.fn>;
    shareWhatsApp: ReturnType<typeof vi.fn>;
    showError: ReturnType<typeof vi.fn>;
  };

  const sampleInvitation: InvitationWithGuests = {
    id: 'inv-1',
    event_id: 'evt-123',
    group_name: 'Familia Ejemplo',
    kind: 'group',
    phone: '+573000000000',
    code: 'ABC2345678',
    created_at: '2026-10-01T00:00:00-05:00',
    updated_at: '2026-10-01T00:00:00-05:00',
    whatsapp_sent_at: null,
    guests: [
      {
        id: 'g-1',
        invitation_id: 'inv-1',
        event_id: 'evt-123',
        full_name: 'Invitado Ejemplo',
        rsvp: 'accepted',
        rsvp_updated_at: '2026-10-05T00:00:00-05:00',
        arrived_at: null,
        arrived_by: null,
        sort_order: 0,
        created_at: '2026-10-01T00:00:00-05:00',
      },
    ],
  };

  beforeEach(async () => {
    mockModal = {
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockResolvedValue({ role: 'backdrop' }),
    };
    mockModalCtrl = {
      create: vi.fn().mockResolvedValue(mockModal),
    };
    mockAlert = {
      present: vi.fn().mockResolvedValue(undefined),
      onDidDismiss: vi.fn().mockResolvedValue({ role: 'cancel' }),
    };
    mockAlertCtrl = {
      create: vi.fn().mockResolvedValue(mockAlert),
    };
    mockEventContext = {
      event: signal(null),
      role: signal('owner'),
      isOwner: signal(true),
      error: signal(null),
      loading: signal(false),
      load: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn(),
    };
    mockInvitationsRepo = {
      get: vi.fn().mockResolvedValue(sampleInvitation),
      setGuestRsvp: vi.fn().mockResolvedValue(undefined),
      clearWhatsAppSent: vi.fn().mockResolvedValue(undefined),
    };
    mockAuth = {
      ready: signal(true),
      session: signal({ user: { id: 'usr-1' } }),
    };
    mockRealtime = {
      watch: vi.fn().mockReturnValue(() => {}),
    };
    mockInvitationActions = {
      confirmDelete: vi.fn().mockResolvedValue(false),
      shareWhatsApp: vi.fn().mockResolvedValue(undefined),
      showError: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [InvitationDetailPage],
      providers: [
        provideRouter([]),
        { provide: ModalController, useValue: mockModalCtrl },
        { provide: AlertController, useValue: mockAlertCtrl },
        { provide: EventContextService, useValue: mockEventContext },
        { provide: InvitationsRepository, useValue: mockInvitationsRepo },
        { provide: AuthService, useValue: mockAuth },
        { provide: RealtimeService, useValue: mockRealtime },
        { provide: InvitationActionsService, useValue: mockInvitationActions },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InvitationDetailPage);
    fixture.componentRef.setInput('id', 'evt-123');
    fixture.componentRef.setInput('invitationId', 'inv-1');
    component = fixture.componentInstance;
  });

  it('configures openEditModal sheet with expandToScroll: false', async () => {
    component.invitation.set(sampleInvitation);

    await component.openEditModal();

    expect(mockModalCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        component: InvitationFormComponent,
        componentProps: {
          eventId: 'evt-123',
          invitation: sampleInvitation,
        },
        breakpoints: [0, 0.9, 1],
        initialBreakpoint: 0.9,
        expandToScroll: false,
      }),
    );
  });

  it('displays "Aún no se ha enviado por WhatsApp" and hides clear button without whatsapp_sent_at', () => {
    component.invitation.set({ ...sampleInvitation, whatsapp_sent_at: null });
    component.loading.set(false);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Aún no se ha enviado por WhatsApp');
    const clearButton = fixture.nativeElement.querySelector('.clear-sent-button');
    expect(clearButton).toBeNull();
  });

  it('displays "Enviada por WhatsApp el ..." and shows clear button with whatsapp_sent_at', () => {
    component.invitation.set({
      ...sampleInvitation,
      whatsapp_sent_at: '2026-10-15T10:00:00-05:00',
    });
    component.loading.set(false);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Enviada por WhatsApp el 15 oct');
    const clearButton = fixture.nativeElement.querySelector('.clear-sent-button');
    expect(clearButton).not.toBeNull();
    expect(clearButton.textContent).toContain('Marcar como no enviada');
  });

  it('calls clearWhatsAppSent with invitation id and reloads on alert confirmation', async () => {
    component.invitation.set({
      ...sampleInvitation,
      whatsapp_sent_at: '2026-10-15T10:00:00-05:00',
    });
    component.loading.set(false);

    await component.onClearSent();

    expect(mockAlertCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        header: 'Marcar como no enviada',
        message: 'La invitación vuelve a la lista de pendientes para enviarla otra vez.',
        buttons: expect.arrayContaining([
          expect.objectContaining({ text: 'Cancelar', role: 'cancel' }),
          expect.objectContaining({ text: 'Marcar' }),
        ]),
      }),
    );

    const alertConfig = mockAlertCtrl.create.mock.calls[0][0];
    const markButton = alertConfig.buttons.find((btn: { text: string }) => btn.text === 'Marcar');
    expect(markButton).toBeDefined();

    mockInvitationsRepo.get.mockClear();
    await markButton.handler();

    expect(mockInvitationsRepo.clearWhatsAppSent).toHaveBeenCalledWith('inv-1');
    expect(mockInvitationsRepo.get).toHaveBeenCalledWith('inv-1');
  });

  it('reloads invitation if shareWhatsApp returns true, but not if false', async () => {
    component.invitation.set(sampleInvitation);
    mockEventContext.event.set({
      id: 'evt-123',
      name: 'Baby Shower',
      starts_at: '2026-11-29T15:00:00-05:00',
      rsvp_deadline: '2026-11-15T00:00:00-05:00',
    } as unknown as EventRow);

    mockInvitationActions.shareWhatsApp.mockResolvedValue(true);
    mockInvitationsRepo.get.mockClear();

    await component.onShareWhatsApp();
    expect(mockInvitationsRepo.get).toHaveBeenCalledWith('inv-1');

    mockInvitationsRepo.get.mockClear();
    mockInvitationActions.shareWhatsApp.mockResolvedValue(false);

    await component.onShareWhatsApp();
    expect(mockInvitationsRepo.get).not.toHaveBeenCalled();
  });
});
