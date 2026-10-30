import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { ModalController } from '@ionic/angular';
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
import { InvitationListPage } from './invitation-list.page';

describe('InvitationListPage', () => {
  beforeAll(() => {
    if (!Element.prototype.scrollTo) {
      Element.prototype.scrollTo = vi.fn();
    }
  });

  let fixture: ComponentFixture<InvitationListPage>;
  let component: InvitationListPage;
  let mockModalCtrl: { create: ReturnType<typeof vi.fn> };
  let mockModal: { present: ReturnType<typeof vi.fn>; onDidDismiss: ReturnType<typeof vi.fn> };
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

  const invWithoutSend: InvitationWithGuests = {
    id: 'inv-1',
    event_id: 'evt-123',
    group_name: 'Familia Uno',
    kind: 'group',
    phone: '+573001111111',
    code: 'CODE1',
    created_at: '2026-10-01T00:00:00-05:00',
    updated_at: '2026-10-01T00:00:00-05:00',
    whatsapp_sent_at: null,
    guests: [
      {
        id: 'g-1',
        invitation_id: 'inv-1',
        event_id: 'evt-123',
        full_name: 'Persona Uno',
        rsvp: 'pending',
        rsvp_updated_at: null,
        arrived_at: null,
        arrived_by: null,
        sort_order: 0,
        created_at: '2026-10-01T00:00:00-05:00',
      },
    ],
  };

  const invSent: InvitationWithGuests = {
    id: 'inv-2',
    event_id: 'evt-123',
    group_name: 'Familia Dos',
    kind: 'group',
    phone: '+573002222222',
    code: 'CODE2',
    created_at: '2026-10-01T00:00:00-05:00',
    updated_at: '2026-10-01T00:00:00-05:00',
    whatsapp_sent_at: '2026-10-02T10:00:00-05:00',
    guests: [
      {
        id: 'g-2',
        invitation_id: 'inv-2',
        event_id: 'evt-123',
        full_name: 'Persona Dos',
        rsvp: 'pending',
        rsvp_updated_at: null,
        arrived_at: null,
        arrived_by: null,
        sort_order: 0,
        created_at: '2026-10-01T00:00:00-05:00',
      },
    ],
  };

  const invNoPhone: InvitationWithGuests = {
    id: 'inv-3',
    event_id: 'evt-123',
    group_name: 'Familia Tres',
    kind: 'group',
    phone: null,
    code: 'CODE3',
    created_at: '2026-10-01T00:00:00-05:00',
    updated_at: '2026-10-01T00:00:00-05:00',
    whatsapp_sent_at: null,
    guests: [
      {
        id: 'g-3',
        invitation_id: 'inv-3',
        event_id: 'evt-123',
        full_name: 'Persona Tres',
        rsvp: 'pending',
        rsvp_updated_at: null,
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
      list: vi.fn().mockResolvedValue([]),
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
      imports: [InvitationListPage],
      providers: [
        provideRouter([]),
        { provide: ModalController, useValue: mockModalCtrl },
        { provide: EventContextService, useValue: mockEventContext },
        { provide: InvitationsRepository, useValue: mockInvitationsRepo },
        { provide: AuthService, useValue: mockAuth },
        { provide: RealtimeService, useValue: mockRealtime },
        { provide: InvitationActionsService, useValue: mockInvitationActions },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InvitationListPage);
    fixture.componentRef.setInput('id', 'evt-123');
    component = fixture.componentInstance;
  });

  it('configures openCreateModal sheet with expandToScroll: false', async () => {
    await component.openCreateModal();

    expect(mockModalCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        component: InvitationFormComponent,
        componentProps: {
          eventId: 'evt-123',
        },
        breakpoints: [0, 0.9, 1],
        initialBreakpoint: 0.9,
        expandToScroll: false,
      }),
    );
  });

  it('shows pending send count button and proper send state labels for invitations', () => {
    component.invitations.set([invWithoutSend, invSent, invNoPhone]);
    component.loading.set(false);
    fixture.detectChanges();

    const sendQueueBtn = fixture.nativeElement.querySelector('.send-queue-button');
    expect(sendQueueBtn).not.toBeNull();
    expect(sendQueueBtn.textContent).toContain('Enviar invitaciones pendientes (1)');

    const sendStates = fixture.nativeElement.querySelectorAll('.send-state');
    expect(sendStates.length).toBe(3);
    expect(sendStates[0].textContent).toContain('Sin enviar');
    expect(sendStates[1].textContent).toContain('Enviada');
    expect(sendStates[2].textContent).toContain('Sin teléfono');
  });

  it('hides pending send button when all invitations with phone are sent', () => {
    component.invitations.set([invSent, invNoPhone]);
    component.loading.set(false);
    fixture.detectChanges();

    const sendQueueBtn = fixture.nativeElement.querySelector('.send-queue-button');
    expect(sendQueueBtn).toBeNull();
  });

  it('navigates to send queue on openSendQueue', async () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    await component.openSendQueue();

    expect(navigateSpy).toHaveBeenCalledWith(['/eventos', 'evt-123', 'invitaciones', 'envio']);
  });

  it('reloads invitations if shareWhatsApp returns true, but not if false', async () => {
    mockEventContext.event.set({
      id: 'evt-123',
      name: 'Baby Shower',
      starts_at: '2026-11-29T15:00:00-05:00',
      rsvp_deadline: '2026-11-15T00:00:00-05:00',
    } as unknown as EventRow);

    mockInvitationActions.shareWhatsApp.mockResolvedValue(true);
    mockInvitationsRepo.list.mockClear();

    await component.onShareWhatsApp(new Event('click'), invWithoutSend);
    expect(mockInvitationsRepo.list).toHaveBeenCalledWith('evt-123');

    mockInvitationsRepo.list.mockClear();
    mockInvitationActions.shareWhatsApp.mockResolvedValue(false);

    await component.onShareWhatsApp(new Event('click'), invWithoutSend);
    expect(mockInvitationsRepo.list).not.toHaveBeenCalled();
  });

  describe('paginación', () => {
    function buildFakeInvitations(count: number): InvitationWithGuests[] {
      return Array.from({ length: count }, (_, i) => {
        const index = i + 1;
        const id = `inv-${index}`;
        return {
          id,
          event_id: 'evt-123',
          group_name: `Familia Ejemplo ${index}`,
          kind: 'group',
          phone: `+5730000000${index.toString().padStart(2, '0')}`,
          code: `CODE${index}`,
          created_at: '2026-10-01T00:00:00-05:00',
          updated_at: '2026-10-01T00:00:00-05:00',
          whatsapp_sent_at: null,
          guests: [
            {
              id: `g-${index}`,
              invitation_id: id,
              event_id: 'evt-123',
              full_name: `Persona Ejemplo ${index}`,
              rsvp: 'pending',
              rsvp_updated_at: null,
              arrived_at: null,
              arrived_by: null,
              sort_order: 0,
              created_at: '2026-10-01T00:00:00-05:00',
            },
          ],
        };
      });
    }

    it('con 25 invitaciones muestra 10 cards, existe paginación con "Página 1 de 3" y botón anterior deshabilitado', () => {
      component.invitations.set(buildFakeInvitations(25));
      component.loading.set(false);
      fixture.detectChanges();

      const cards = fixture.nativeElement.querySelectorAll('ion-card.invitation-card');
      expect(cards.length).toBe(10);

      const pagination = fixture.nativeElement.querySelector('nav.pagination');
      expect(pagination).not.toBeNull();

      const status = fixture.nativeElement.querySelector('.pagination__status');
      expect(status?.textContent?.trim()).toBe('Página 1 de 3');

      const prevButton = fixture.nativeElement.querySelector(
        'ion-button[aria-label="Página anterior"]',
      );
      expect(prevButton?.disabled ?? prevButton?.hasAttribute('disabled')).toBe(true);
    });

    it('goToNextPage muestra las invitaciones 11 a 20 con estado "Página 2 de 3"', () => {
      component.invitations.set(buildFakeInvitations(25));
      component.loading.set(false);
      fixture.detectChanges();

      component.goToNextPage();
      fixture.detectChanges();

      const cards = fixture.nativeElement.querySelectorAll('ion-card.invitation-card');
      expect(cards.length).toBe(10);
      expect(cards[0].querySelector('.group-name')?.textContent?.trim()).toBe('Familia Ejemplo 11');

      const status = fixture.nativeElement.querySelector('.pagination__status');
      expect(status?.textContent?.trim()).toBe('Página 2 de 3');
    });

    it('en la página 3 se ven 5 cards y el botón siguiente está deshabilitado', () => {
      component.invitations.set(buildFakeInvitations(25));
      component.loading.set(false);
      fixture.detectChanges();

      component.goToNextPage();
      component.goToNextPage();
      fixture.detectChanges();

      const cards = fixture.nativeElement.querySelectorAll('ion-card.invitation-card');
      expect(cards.length).toBe(5);
      expect(cards[0].querySelector('.group-name')?.textContent?.trim()).toBe('Familia Ejemplo 21');

      const nextButton = fixture.nativeElement.querySelector(
        'ion-button[aria-label="Página siguiente"]',
      );
      expect(nextButton?.disabled ?? nextButton?.hasAttribute('disabled')).toBe(true);
    });

    it('estando en la página 2, cambiar el filtro o la búsqueda deja currentPage en 1', () => {
      component.invitations.set(buildFakeInvitations(25));
      component.loading.set(false);
      fixture.detectChanges();

      component.goToNextPage();
      expect(component.currentPage()).toBe(2);

      component.onFilterChange({ detail: { value: 'pending' } } as never);
      expect(component.currentPage()).toBe(1);

      component.goToNextPage();
      expect(component.currentPage()).toBe(2);

      component.onSearchInput({ detail: { value: 'Ejemplo' } } as never);
      expect(component.currentPage()).toBe(1);
    });

    it('con 10 invitaciones o menos no existe nav.pagination', () => {
      component.invitations.set(buildFakeInvitations(10));
      component.loading.set(false);
      fixture.detectChanges();

      const pagination = fixture.nativeElement.querySelector('nav.pagination');
      expect(pagination).toBeNull();
    });

    it('si estando en la página 3 la lista baja a 12 invitaciones, se ve la página 2 con 2 cards', () => {
      component.invitations.set(buildFakeInvitations(25));
      component.loading.set(false);
      fixture.detectChanges();

      component.goToNextPage();
      component.goToNextPage();
      expect(component.currentPage()).toBe(3);

      component.invitations.set(buildFakeInvitations(12));
      fixture.detectChanges();

      const cards = fixture.nativeElement.querySelectorAll('ion-card.invitation-card');
      expect(cards.length).toBe(2);
      expect(cards[0].querySelector('.group-name')?.textContent?.trim()).toBe('Familia Ejemplo 11');

      const status = fixture.nativeElement.querySelector('.pagination__status');
      expect(status?.textContent?.trim()).toBe('Página 2 de 2');
    });

    it('totalsLabel con 25 invitaciones sigue contando las 25', () => {
      component.invitations.set(buildFakeInvitations(25));
      component.loading.set(false);
      fixture.detectChanges();

      expect(component.totalsLabel()).toBe('25 invitaciones · 25 personas');
    });
  });
});
