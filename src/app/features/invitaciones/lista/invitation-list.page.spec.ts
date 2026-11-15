import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { AlertController, ModalController } from '@ionic/angular';
import {
  AuthService,
  EventContextService,
  EventRole,
  EventRow,
  InvitationBatchRow,
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
  let mockAlertCtrl: { create: ReturnType<typeof vi.fn> };
  let mockModal: { present: ReturnType<typeof vi.fn>; onDidDismiss: ReturnType<typeof vi.fn> };
  let mockEventContext: {
    event: ReturnType<typeof signal<EventRow | null>>;
    role: ReturnType<typeof signal<EventRole | null>>;
    isOwner: ReturnType<typeof signal<boolean>>;
    batches: ReturnType<typeof signal<InvitationBatchRow[]>>;
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
    batch_id: null,
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
    batch_id: null,
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
    batch_id: null,
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
    mockAlertCtrl = {
      create: vi.fn(),
    };
    mockEventContext = {
      event: signal(null),
      role: signal('owner'),
      isOwner: signal(true),
      batches: signal<InvitationBatchRow[]>([]),
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
        { provide: AlertController, useValue: mockAlertCtrl },
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

  it('configures openCreateModal sheet with expandToScroll: false, canDismiss and discardGuard in componentProps', async () => {
    await component.openCreateModal();

    expect(mockModalCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        component: InvitationFormComponent,
        componentProps: expect.objectContaining({
          eventId: 'evt-123',
          discardGuard: expect.any(Object),
        }),
        canDismiss: expect.any(Function),
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
    expect(sendQueueBtn.textContent).toContain('Enviar por WhatsApp (1 por enviar)');

    const sendStates = fixture.nativeElement.querySelectorAll('.send-state');
    expect(sendStates.length).toBe(3);
    expect(sendStates[0].textContent).toContain('Sin enviar');
    expect(sendStates[1].textContent).toContain('Enviada');
    expect(sendStates[2].textContent).toContain('Sin teléfono');
  });

  it('renders updated filter segment labels and summary text formatting', () => {
    const invMixed: InvitationWithGuests = {
      id: 'inv-mixed',
      event_id: 'evt-123',
      batch_id: null,
      group_name: 'Familia Mixta',
      kind: 'group',
      phone: null,
      code: 'MIX123',
      created_at: '2026-10-01T00:00:00-05:00',
      updated_at: '2026-10-01T00:00:00-05:00',
      whatsapp_sent_at: null,
      guests: [
        {
          id: 'g-m1',
          invitation_id: 'inv-mixed',
          event_id: 'evt-123',
          full_name: 'Invitado Uno',
          rsvp: 'accepted',
          rsvp_updated_at: null,
          arrived_at: null,
          arrived_by: null,
          sort_order: 0,
          created_at: '2026-10-01T00:00:00-05:00',
        },
        {
          id: 'g-m2',
          invitation_id: 'inv-mixed',
          event_id: 'evt-123',
          full_name: 'Invitado Dos',
          rsvp: 'pending',
          rsvp_updated_at: null,
          arrived_at: null,
          arrived_by: null,
          sort_order: 1,
          created_at: '2026-10-01T00:00:00-05:00',
        },
        {
          id: 'g-m3',
          invitation_id: 'inv-mixed',
          event_id: 'evt-123',
          full_name: 'Invitado Tres',
          rsvp: 'pending',
          rsvp_updated_at: null,
          arrived_at: null,
          arrived_by: null,
          sort_order: 2,
          created_at: '2026-10-01T00:00:00-05:00',
        },
      ],
    };

    const invPlural: InvitationWithGuests = {
      id: 'inv-pl',
      event_id: 'evt-123',
      batch_id: null,
      group_name: 'Familia Plural',
      kind: 'group',
      phone: null,
      code: 'PLU123',
      created_at: '2026-10-01T00:00:00-05:00',
      updated_at: '2026-10-01T00:00:00-05:00',
      whatsapp_sent_at: null,
      guests: [
        {
          id: 'g-p1',
          invitation_id: 'inv-pl',
          event_id: 'evt-123',
          full_name: 'Invitado P1',
          rsvp: 'accepted',
          rsvp_updated_at: null,
          arrived_at: null,
          arrived_by: null,
          sort_order: 0,
          created_at: '2026-10-01T00:00:00-05:00',
        },
        {
          id: 'g-p2',
          invitation_id: 'inv-pl',
          event_id: 'evt-123',
          full_name: 'Invitado P2',
          rsvp: 'accepted',
          rsvp_updated_at: null,
          arrived_at: null,
          arrived_by: null,
          sort_order: 1,
          created_at: '2026-10-01T00:00:00-05:00',
        },
        {
          id: 'g-p3',
          invitation_id: 'inv-pl',
          event_id: 'evt-123',
          full_name: 'Invitado P3',
          rsvp: 'declined',
          rsvp_updated_at: null,
          arrived_at: null,
          arrived_by: null,
          sort_order: 2,
          created_at: '2026-10-01T00:00:00-05:00',
        },
        {
          id: 'g-p4',
          invitation_id: 'inv-pl',
          event_id: 'evt-123',
          full_name: 'Invitado P4',
          rsvp: 'declined',
          rsvp_updated_at: null,
          arrived_at: null,
          arrived_by: null,
          sort_order: 3,
          created_at: '2026-10-01T00:00:00-05:00',
        },
      ],
    };

    component.invitations.set([invMixed, invPlural]);
    component.loading.set(false);
    fixture.detectChanges();

    const segmentButtons = fixture.nativeElement.querySelectorAll('ion-segment-button');
    const buttonLabels = Array.from(segmentButtons).map((btn: any) => btn.textContent?.trim());
    expect(buttonLabels).toContain('Todas (2)');
    expect(buttonLabels).toContain('Sin respuesta (0)');
    expect(buttonLabels).toContain('Parciales (2)');
    expect(buttonLabels).toContain('Confirmadas (0)');
    expect(buttonLabels).toContain('No asistirán (0)');

    const summaries = Array.from(fixture.nativeElement.querySelectorAll('.summary-text')).map(
      (el: any) => el.textContent?.trim(),
    );
    expect(summaries[0]).toBe('3 personas · 1 confirmó, 2 sin respuesta');
    expect(summaries[1]).toBe('4 personas · 2 confirmaron, 2 no asistirán');
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

  it('reloads invitations if shareWhatsApp returns opened: true, but not if opened: false', async () => {
    mockEventContext.event.set({
      id: 'evt-123',
      name: 'Baby Shower',
      starts_at: '2026-11-29T15:00:00-05:00',
      rsvp_deadline: '2026-11-15T00:00:00-05:00',
    } as unknown as EventRow);

    mockInvitationActions.shareWhatsApp.mockResolvedValue({ opened: true, marked: true });
    mockInvitationsRepo.list.mockClear();

    await component.onShareWhatsApp(new Event('click'), invWithoutSend);
    expect(mockInvitationsRepo.list).toHaveBeenCalledWith('evt-123');

    mockInvitationsRepo.list.mockClear();
    mockInvitationActions.shareWhatsApp.mockResolvedValue({ opened: false, marked: false });

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
          batch_id: null,
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

    it('con 25 invitaciones muestra 6 cards, existe paginación con "Página 1 de 5" y botón anterior deshabilitado', () => {
      component.invitations.set(buildFakeInvitations(25));
      component.loading.set(false);
      fixture.detectChanges();

      const cards = fixture.nativeElement.querySelectorAll('ion-card.invitation-card');
      expect(cards.length).toBe(6);

      const pagination = fixture.nativeElement.querySelector('nav.pagination');
      expect(pagination).not.toBeNull();

      const status = fixture.nativeElement.querySelector('.pagination__status');
      expect(status?.textContent?.trim()).toBe('Página 1 de 5');

      const prevButton = fixture.nativeElement.querySelector(
        'ion-button[aria-label="Página anterior"]',
      );
      expect(prevButton?.disabled ?? prevButton?.hasAttribute('disabled')).toBe(true);
    });

    it('goToNextPage muestra las invitaciones 7 a 12 con estado "Página 2 de 5"', () => {
      component.invitations.set(buildFakeInvitations(25));
      component.loading.set(false);
      fixture.detectChanges();

      component.goToNextPage();
      fixture.detectChanges();

      const cards = fixture.nativeElement.querySelectorAll('ion-card.invitation-card');
      expect(cards.length).toBe(6);
      expect(cards[0].querySelector('.group-name')?.textContent?.trim()).toBe('Familia Ejemplo 7');

      const status = fixture.nativeElement.querySelector('.pagination__status');
      expect(status?.textContent?.trim()).toBe('Página 2 de 5');
    });

    it('en la página 5 se ve 1 card y el botón siguiente está deshabilitado', () => {
      component.invitations.set(buildFakeInvitations(25));
      component.loading.set(false);
      fixture.detectChanges();

      for (let i = 0; i < 4; i++) component.goToNextPage();
      fixture.detectChanges();

      const cards = fixture.nativeElement.querySelectorAll('ion-card.invitation-card');
      expect(cards.length).toBe(1);
      expect(cards[0].querySelector('.group-name')?.textContent?.trim()).toBe('Familia Ejemplo 25');

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

    it('con 6 invitaciones o menos no existe nav.pagination', () => {
      component.invitations.set(buildFakeInvitations(6));
      component.loading.set(false);
      fixture.detectChanges();

      const pagination = fixture.nativeElement.querySelector('nav.pagination');
      expect(pagination).toBeNull();
    });

    it('si estando en la página 3 la lista baja a 8 invitaciones, se ve la página 2 con 2 cards', () => {
      component.invitations.set(buildFakeInvitations(25));
      component.loading.set(false);
      fixture.detectChanges();

      component.goToNextPage();
      component.goToNextPage();
      expect(component.currentPage()).toBe(3);

      component.invitations.set(buildFakeInvitations(8));
      fixture.detectChanges();

      const cards = fixture.nativeElement.querySelectorAll('ion-card.invitation-card');
      expect(cards.length).toBe(2);
      expect(cards[0].querySelector('.group-name')?.textContent?.trim()).toBe('Familia Ejemplo 7');

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

  describe('filtro por tanda', () => {
    const batchTwo: InvitationBatchRow = {
      id: 'batch-2',
      event_id: 'evt-123',
      name: 'Segunda tanda',
      rsvp_deadline: '2026-11-20T23:59:59-05:00',
      created_at: '2026-11-01T10:00:00-05:00',
    };

    const batchThree: InvitationBatchRow = {
      id: 'batch-3',
      event_id: 'evt-123',
      name: 'Tercera tanda',
      rsvp_deadline: '2026-11-25T23:59:59-05:00',
      created_at: '2026-11-02T10:00:00-05:00',
    };

    function makeInvitation(
      id: string,
      groupName: string,
      batchId: string | null,
      rsvp: 'pending' | 'accepted' | 'declined',
      phone: string | null = '+573000000001',
      sentAt: string | null = null,
    ): InvitationWithGuests {
      return {
        id,
        event_id: 'evt-123',
        batch_id: batchId,
        group_name: groupName,
        kind: 'group',
        phone,
        code: `C-${id}`,
        created_at: '2026-10-01T00:00:00-05:00',
        updated_at: '2026-10-01T00:00:00-05:00',
        whatsapp_sent_at: sentAt,
        guests: [
          {
            id: `g-${id}`,
            invitation_id: id,
            event_id: 'evt-123',
            full_name: `Integrante ${groupName}`,
            rsvp,
            rsvp_updated_at: null,
            arrived_at: null,
            arrived_by: null,
            sort_order: 0,
            created_at: '2026-10-01T00:00:00-05:00',
          },
        ],
      };
    }

    it('sin tandas no muestra el selector ni etiquetas de tanda en las cards', () => {
      mockEventContext.batches.set([]);
      component.invitations.set([invWithoutSend, invSent]);
      component.loading.set(false);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('ion-select.batch-filter')).toBeNull();
      expect(fixture.nativeElement.querySelectorAll('.batch-badge').length).toBe(0);
    });

    it('con 3 invitaciones en primera tanda y 2 en segunda actualiza conteos, totales, badges y mantiene pendingSendCount', () => {
      mockEventContext.batches.set([batchTwo, batchThree]);
      const items: InvitationWithGuests[] = [
        makeInvitation('inv-p1', 'Familia Alfa', null, 'pending', '+573001111111', null),
        makeInvitation('inv-p2', 'Familia Beta', null, 'accepted', '+573002222222', null),
        makeInvitation('inv-p3', 'Familia Gamma', null, 'declined', null, null),
        makeInvitation('inv-s1', 'Familia Delta', 'batch-2', 'pending', '+573003333333', null),
        makeInvitation('inv-s2', 'Familia Epsilon', 'batch-2', 'accepted', null, null),
      ];
      component.invitations.set(items);
      component.loading.set(false);
      fixture.detectChanges();

      const select = fixture.nativeElement.querySelector('ion-select.batch-filter');
      expect(select).not.toBeNull();
      const options = Array.from(
        select.querySelectorAll('ion-select-option'),
      ) as HTMLElement[];
      expect(options.map((opt) => opt.textContent?.trim())).toEqual([
        'Todas las tandas',
        'Primera tanda',
        'Segunda tanda',
        'Tercera tanda',
      ]);

      // En "Todas las tandas" cada card muestra su etiqueta de tanda
      const badges = Array.from(fixture.nativeElement.querySelectorAll('.batch-badge')).map(
        (el: any) => el.textContent?.trim(),
      );
      expect(badges).toEqual([
        'Primera tanda',
        'Primera tanda',
        'Primera tanda',
        'Segunda tanda',
        'Segunda tanda',
      ]);
      expect(component.pendingSendCount()).toBe(3);

      // Filtrar por Primera tanda
      component.onBatchFilterChange({ detail: { value: 'first' } } as never);
      fixture.detectChanges();

      expect(component.filterCounts()).toEqual({
        all: 3,
        pending: 1,
        partial: 0,
        accepted: 1,
        declined: 1,
      });
      expect(component.totalsLabel()).toBe('3 invitaciones · 3 personas');
      expect(component.filteredItems().length).toBe(3);
      expect(fixture.nativeElement.querySelectorAll('.batch-badge').length).toBe(0);
      expect(component.pendingSendCount()).toBe(3);

      // Filtrar por Segunda tanda
      component.onBatchFilterChange({ detail: { value: 'batch-2' } } as never);
      fixture.detectChanges();

      expect(component.filterCounts()).toEqual({
        all: 2,
        pending: 1,
        partial: 0,
        accepted: 1,
        declined: 0,
      });
      expect(component.totalsLabel()).toBe('2 invitaciones · 2 personas');
      expect(component.filteredItems().map((item) => item.invitation.id)).toEqual([
        'inv-s1',
        'inv-s2',
      ]);
      expect(component.pendingSendCount()).toBe(3);
    });

    it('combina filtro de tanda, búsqueda y filtro de estado', () => {
      mockEventContext.batches.set([batchTwo]);
      component.invitations.set([
        makeInvitation('inv-1', 'Familia Castro', null, 'accepted'),
        makeInvitation('inv-2', 'Familia Castro', 'batch-2', 'pending'),
        makeInvitation('inv-3', 'Familia Castro', 'batch-2', 'accepted'),
        makeInvitation('inv-4', 'Familia López', 'batch-2', 'accepted'),
      ]);
      component.loading.set(false);
      fixture.detectChanges();

      component.onBatchFilterChange({ detail: { value: 'batch-2' } } as never);
      component.onSearchInput({ detail: { value: 'Castro' } } as never);
      expect(component.filterCounts()).toEqual({
        all: 2,
        pending: 1,
        partial: 0,
        accepted: 1,
        declined: 0,
      });

      component.onFilterChange({ detail: { value: 'accepted' } } as never);
      fixture.detectChanges();

      expect(component.filteredItems().map((item) => item.invitation.id)).toEqual(['inv-3']);
      expect(component.totalsLabel()).toBe('1 invitación · 1 persona');
    });

    it('cambiar el filtro de tanda estando en la página 2 vuelve a la página 1', () => {
      mockEventContext.batches.set([batchTwo]);
      const manyInvitations = Array.from({ length: 15 }, (_, idx) =>
        makeInvitation(
          `inv-page-${idx + 1}`,
          `Familia Pagina ${idx + 1}`,
          idx >= 8 ? 'batch-2' : null,
          'pending',
        ),
      );
      component.invitations.set(manyInvitations);
      component.loading.set(false);
      fixture.detectChanges();

      component.goToNextPage();
      expect(component.currentPage()).toBe(2);

      component.onBatchFilterChange({ detail: { value: 'batch-2' } } as never);
      expect(component.currentPage()).toBe(1);
    });

    it('si la tanda filtrada desaparece de batches(), el filtro vuelve a "Todas las tandas"', () => {
      mockEventContext.batches.set([batchTwo, batchThree]);
      component.invitations.set([
        makeInvitation('inv-1', 'Familia Uno', null, 'pending'),
        makeInvitation('inv-2', 'Familia Dos', 'batch-2', 'pending'),
        makeInvitation('inv-3', 'Familia Tres', 'batch-3', 'pending'),
      ]);
      component.loading.set(false);
      fixture.detectChanges();

      component.onBatchFilterChange({ detail: { value: 'batch-2' } } as never);
      fixture.detectChanges();
      expect(component.filteredItems().map((item) => item.invitation.id)).toEqual(['inv-2']);

      // Se borra batch-2
      mockEventContext.batches.set([batchThree]);
      fixture.detectChanges();

      expect(component.selectedBatchFilter()).toBe('all');
      expect(component.effectiveBatchFilter()).toBe('all');
      expect(component.filteredItems().length).toBe(3);
    });
  });
});
