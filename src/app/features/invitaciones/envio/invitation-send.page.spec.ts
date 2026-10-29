import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  EventContextService,
  EventRole,
  EventRow,
  InvitationWithGuests,
  InvitationsRepository,
  RealtimeService,
} from '../../../core';
import { InvitationActionsService } from '../invitation-actions.service';
import { InvitationSendPage } from './invitation-send.page';

const mockEvent: EventRow = {
  id: 'evt-1',
  name: 'Baby Shower',
  welcome_message: 'Celebración familiar',
  starts_at: '2026-11-29T16:00:00-05:00',
  venue_name: 'Salón Comunal',
  venue_address: 'Calle 10 # 5-20',
  city: 'Neiva',
  map_url: null,
  rsvp_deadline: '2026-11-15T23:59:59-05:00',
  theme_id: 'pastel',
  budget_cop: null,
  created_by: 'usr-1',
  created_at: '2026-01-01T00:00:00-05:00',
  updated_at: '2026-01-01T00:00:00-05:00',
};

function createInvitation(
  id: string,
  group_name: string,
  phone: string | null,
  whatsapp_sent_at: string | null = null,
): InvitationWithGuests {
  return {
    id,
    event_id: 'evt-1',
    group_name,
    kind: 'family',
    phone,
    code: `CODE-${id}`,
    created_at: '2026-01-01T00:00:00-05:00',
    updated_at: '2026-01-01T00:00:00-05:00',
    whatsapp_sent_at,
    guests: [
      {
        id: `gst-${id}-1`,
        invitation_id: id,
        event_id: 'evt-1',
        full_name: `${group_name} Invitado`,
        sort_order: 1,
        rsvp: 'pending',
        arrived_at: null,
        arrived_by: null,
        rsvp_updated_at: null,
        created_at: '2026-01-01T00:00:00-05:00',
      },
    ],
  };
}

describe('InvitationSendPage', () => {
  let fixture: ComponentFixture<InvitationSendPage>;
  let component: InvitationSendPage;

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
    list: ReturnType<typeof vi.fn>;
    clearWhatsAppSent: ReturnType<typeof vi.fn>;
  };
  let mockRealtime: {
    watch: ReturnType<typeof vi.fn>;
  };
  let mockInvitationActions: {
    shareWhatsApp: ReturnType<typeof vi.fn>;
    whatsAppMessage: ReturnType<typeof vi.fn>;
    showError: ReturnType<typeof vi.fn>;
  };

  const invitationA = createInvitation('inv-a', 'A', '+573001111111', null);
  const invitationB = createInvitation('inv-b', 'B', '+573002222222', '2026-01-01T10:00:00-05:00');
  const invitationC = createInvitation('inv-c', 'C', '+573003333333', null);
  const invitationD = createInvitation('inv-d', 'D', null, null);

  beforeEach(async () => {
    mockEventContext = {
      event: signal<EventRow | null>(mockEvent),
      role: signal<EventRole | null>('owner'),
      isOwner: signal(true),
      error: signal<string | null>(null),
      loading: signal(false),
      load: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn(),
    };

    mockInvitationsRepo = {
      list: vi.fn().mockResolvedValue([invitationA, invitationB, invitationC, invitationD]),
      clearWhatsAppSent: vi.fn().mockResolvedValue(undefined),
    };

    mockRealtime = {
      watch: vi.fn().mockReturnValue(() => {}),
    };

    mockInvitationActions = {
      shareWhatsApp: vi.fn().mockResolvedValue(true),
      whatsAppMessage: vi.fn().mockReturnValue('Hola A, te invitamos a nuestro evento.'),
      showError: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [InvitationSendPage],
      providers: [
        provideRouter([]),
        { provide: EventContextService, useValue: mockEventContext },
        { provide: InvitationsRepository, useValue: mockInvitationsRepo },
        { provide: RealtimeService, useValue: mockRealtime },
        { provide: InvitationActionsService, useValue: mockInvitationActions },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InvitationSendPage);
    fixture.componentRef.setInput('id', 'evt-1');
    component = fixture.componentInstance;
  });

  it('1. queue is A, C; current is A; progress says 1 de 3 enviadas; noPhoneNote appears', () => {
    component.invitations.set([invitationA, invitationB, invitationC, invitationD]);
    component.loading.set(false);
    fixture.detectChanges();

    expect(component.queue().map((i) => i.id)).toEqual(['inv-a', 'inv-c']);
    expect(component.current()?.id).toBe('inv-a');

    const progressEl = fixture.nativeElement.querySelector('.progress-label');
    expect(progressEl?.textContent).toContain('1 de 3 enviadas');

    const noPhoneEl = fixture.nativeElement.querySelector('.no-phone-note');
    expect(noPhoneEl?.textContent).toContain(
      '1 invitación no tiene teléfono. Compártela desde su detalle.',
    );
  });

  it('2. sendCurrent with shareWhatsApp returning true moves current to C, sets lastOpened to A, shows success text and updates progress to 2 de 3 enviadas', async () => {
    component.invitations.set([invitationA, invitationB, invitationC, invitationD]);
    component.loading.set(false);
    fixture.detectChanges();

    mockInvitationActions.shareWhatsApp.mockResolvedValue(true);

    await component.sendCurrent();
    fixture.detectChanges();

    expect(component.current()?.id).toBe('inv-c');
    expect(component.lastOpened()).toEqual({ id: 'inv-a', groupName: 'A' });

    const lastOpenedEl = fixture.nativeElement.querySelector('.last-opened');
    expect(lastOpenedEl?.textContent).toContain('Se abrió el chat de A.');

    const progressEl = fixture.nativeElement.querySelector('.progress-label');
    expect(progressEl?.textContent).toContain('2 de 3 enviadas');
  });

  it('3. sendCurrent with shareWhatsApp returning false keeps current as A and has no lastOpened', async () => {
    component.invitations.set([invitationA, invitationB, invitationC, invitationD]);
    component.loading.set(false);
    fixture.detectChanges();

    mockInvitationActions.shareWhatsApp.mockResolvedValue(false);

    await component.sendCurrent();
    fixture.detectChanges();

    expect(component.current()?.id).toBe('inv-a');
    expect(component.lastOpened()).toBeNull();
    expect(fixture.nativeElement.querySelector('.last-opened')).toBeNull();
  });

  it('4. undoLast after case 2 calls clearWhatsAppSent with id of A and A returns to current', async () => {
    component.invitations.set([invitationA, invitationB, invitationC, invitationD]);
    component.loading.set(false);
    fixture.detectChanges();

    mockInvitationActions.shareWhatsApp.mockResolvedValue(true);
    await component.sendCurrent();
    fixture.detectChanges();

    expect(component.current()?.id).toBe('inv-c');

    await component.undoLast();
    fixture.detectChanges();

    expect(mockInvitationsRepo.clearWhatsAppSent).toHaveBeenCalledWith('inv-a');
    expect(component.current()?.id).toBe('inv-a');
    expect(component.lastOpened()).toBeNull();
  });

  it('5. skipCurrent moves current to C and queue becomes C, A', () => {
    component.invitations.set([invitationA, invitationB, invitationC, invitationD]);
    component.loading.set(false);
    fixture.detectChanges();

    expect(component.current()?.id).toBe('inv-a');

    component.skipCurrent();
    fixture.detectChanges();

    expect(component.current()?.id).toBe('inv-c');
    expect(component.queue().map((i) => i.id)).toEqual(['inv-c', 'inv-a']);
  });

  it('6. with all sent shows all sent empty state and has no ion-footer', () => {
    const allSent = [
      { ...invitationA, whatsapp_sent_at: '2026-01-01T10:00:00-05:00' },
      invitationB,
      { ...invitationC, whatsapp_sent_at: '2026-01-01T10:00:00-05:00' },
      invitationD,
    ];
    component.invitations.set(allSent);
    component.loading.set(false);
    fixture.detectChanges();

    expect(component.current()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain(
      'Ya se enviaron todas las invitaciones que tienen teléfono.',
    );
    expect(fixture.nativeElement.querySelector('ion-footer')).toBeNull();
  });

  it('7. two consecutive clicks on sendCurrent while first is in flight calls shareWhatsApp only once', async () => {
    component.invitations.set([invitationA, invitationB, invitationC, invitationD]);
    component.loading.set(false);
    fixture.detectChanges();

    let resolveShare!: (value: boolean) => void;
    mockInvitationActions.shareWhatsApp.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveShare = resolve;
        }),
    );

    const call1 = component.sendCurrent();
    const call2 = component.sendCurrent();

    resolveShare(true);
    await Promise.all([call1, call2]);

    expect(mockInvitationActions.shareWhatsApp).toHaveBeenCalledTimes(1);
  });

  it('shows empty state when no invitations have phone', () => {
    component.invitations.set([invitationD]);
    component.loading.set(false);
    fixture.detectChanges();

    expect(component.current()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain(
      'Ninguna invitación tiene teléfono todavía.',
    );
  });

  it('toggles message preview on click', () => {
    component.invitations.set([invitationA]);
    component.loading.set(false);
    fixture.detectChanges();

    expect(component.showPreview()).toBe(false);
    expect(fixture.nativeElement.querySelector('.message-preview')).toBeNull();

    component.togglePreview();
    fixture.detectChanges();

    expect(component.showPreview()).toBe(true);
    const previewEl = fixture.nativeElement.querySelector('.message-preview');
    expect(previewEl?.textContent).toContain('Hola A, te invitamos a nuestro evento.');

    component.togglePreview();
    fixture.detectChanges();

    expect(component.showPreview()).toBe(false);
    expect(fixture.nativeElement.querySelector('.message-preview')).toBeNull();
  });

  it('loads event and invitations and registers realtime on ionViewWillEnter', async () => {
    component.ionViewWillEnter();
    await fixture.whenStable();

    expect(mockEventContext.load).toHaveBeenCalledWith('evt-1');
    expect(mockInvitationsRepo.list).toHaveBeenCalledWith('evt-1');
    expect(mockRealtime.watch).toHaveBeenCalledWith(
      'evt-1',
      ['invitations'],
      expect.any(Function),
      expect.anything(),
    );
  });
});
