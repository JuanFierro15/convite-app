import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  EventContextService,
  EventRole,
  EventRow,
  InvitationBatchRow,
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
  team_id: null,
  created_by: 'usr-1',
  created_at: '2026-01-01T00:00:00-05:00',
  updated_at: '2026-01-01T00:00:00-05:00',
};

function createInvitation(
  id: string,
  group_name: string,
  phone: string | null,
  whatsapp_sent_at: string | null = null,
  batch_id: string | null = null,
): InvitationWithGuests {
  return {
    id,
    event_id: 'evt-1',
    batch_id,
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
    batches: ReturnType<typeof signal<InvitationBatchRow[]>>;
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
    markSent: ReturnType<typeof vi.fn>;
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
      batches: signal<InvitationBatchRow[]>([]),
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
      shareWhatsApp: vi.fn().mockResolvedValue({ opened: true, marked: true }),
      markSent: vi.fn().mockResolvedValue(true),
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

  it('2. sendCurrent with shareWhatsApp returning opened and marked moves current to C, sets lastOpened to A, shows success text and updates progress to 2 de 3 enviadas', async () => {
    component.invitations.set([invitationA, invitationB, invitationC, invitationD]);
    component.loading.set(false);
    fixture.detectChanges();

    mockInvitationActions.shareWhatsApp.mockResolvedValue({ opened: true, marked: true });

    await component.sendCurrent();
    fixture.detectChanges();

    expect(component.current()?.id).toBe('inv-c');
    expect(component.lastOpened()).toEqual({ id: 'inv-a', groupName: 'A' });

    const lastOpenedEl = fixture.nativeElement.querySelector('.last-opened');
    expect(lastOpenedEl?.textContent).toContain('Se abrió el chat de A.');

    const progressEl = fixture.nativeElement.querySelector('.progress-label');
    expect(progressEl?.textContent).toContain('2 de 3 enviadas');
  });

  it('3. sendCurrent with shareWhatsApp returning opened: false keeps current as A and has no lastOpened', async () => {
    component.invitations.set([invitationA, invitationB, invitationC, invitationD]);
    component.loading.set(false);
    fixture.detectChanges();

    mockInvitationActions.shareWhatsApp.mockResolvedValue({ opened: false, marked: false });

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

    mockInvitationActions.shareWhatsApp.mockResolvedValue({ opened: true, marked: true });
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

    let resolveShare!: (value: { opened: boolean; marked: boolean }) => void;
    mockInvitationActions.shareWhatsApp.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveShare = resolve;
        }),
    );

    const call1 = component.sendCurrent();
    const call2 = component.sendCurrent();

    resolveShare({ opened: true, marked: true });
    await Promise.all([call1, call2]);

    expect(mockInvitationActions.shareWhatsApp).toHaveBeenCalledTimes(1);
  });

  it('calls shareWhatsApp with toastAnchor: invitation-send-footer and footer has that id', async () => {
    component.invitations.set([invitationA]);
    component.loading.set(false);
    fixture.detectChanges();

    const footer = fixture.nativeElement.querySelector('ion-footer#invitation-send-footer');
    expect(footer).not.toBeNull();

    await component.sendCurrent();

    expect(mockInvitationActions.shareWhatsApp).toHaveBeenCalledWith(
      invitationA,
      expect.anything(),
      { notifyMarkFailure: false, toastAnchor: 'invitation-send-footer' },
    );
  });

  it('calls showError with toastAnchor: invitation-send-footer when undoLast fails', async () => {
    component.invitations.set([invitationA]);
    component.loading.set(false);
    fixture.detectChanges();

    mockInvitationActions.shareWhatsApp.mockResolvedValue({ opened: true, marked: true });
    await component.sendCurrent();
    fixture.detectChanges();

    const undoErr = new Error('No se pudo deshacer');
    mockInvitationsRepo.clearWhatsAppSent.mockRejectedValue(undoErr);

    await component.undoLast();

    expect(mockInvitationActions.showError).toHaveBeenCalledWith(
      undoErr,
      'invitation-send-footer',
    );
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

    expect(mockEventContext.load).toHaveBeenCalledWith('evt-1', { force: true });
    expect(mockInvitationsRepo.list).toHaveBeenCalledWith('evt-1');
    expect(mockRealtime.watch).toHaveBeenCalledWith(
      'evt-1',
      ['invitations'],
      expect.any(Function),
      expect.anything(),
    );
  });

  describe('marcado fallido y reintento (E-02)', () => {
    it('con el marcado fallido la invitación sigue siendo la actual, no hay .last-opened, hay .mark-failed con el texto exacto y no se crea toast', async () => {
      component.invitations.set([invitationA, invitationB, invitationC, invitationD]);
      component.loading.set(false);
      fixture.detectChanges();

      mockInvitationActions.shareWhatsApp.mockResolvedValue({ opened: true, marked: false });

      await component.sendCurrent();
      fixture.detectChanges();

      expect(component.current()?.id).toBe('inv-a');
      expect(component.lastOpened()).toBeNull();
      expect(fixture.nativeElement.querySelector('.last-opened')).toBeNull();

      const markFailedEl = fixture.nativeElement.querySelector('.mark-failed');
      expect(markFailedEl).not.toBeNull();
      expect(markFailedEl.textContent).toContain('Se abrió el chat, pero no pudimos marcarla como enviada.');
      expect(markFailedEl.textContent).toContain('Marcar como enviada');

      expect(mockInvitationActions.showError).not.toHaveBeenCalled();
      expect(mockInvitationActions.shareWhatsApp).toHaveBeenCalledWith(
        invitationA,
        expect.anything(),
        { notifyMarkFailure: false, toastAnchor: 'invitation-send-footer' },
      );
    });

    it('al reintentar el marcado con éxito la saca de la cola, muestra .last-opened y no vuelve a llamar shareWhatsApp', async () => {
      component.invitations.set([invitationA, invitationB, invitationC, invitationD]);
      component.loading.set(false);
      fixture.detectChanges();

      mockInvitationActions.shareWhatsApp.mockResolvedValue({ opened: true, marked: false });
      await component.sendCurrent();
      fixture.detectChanges();

      expect(component.current()?.id).toBe('inv-a');
      expect(fixture.nativeElement.querySelector('.mark-failed')).not.toBeNull();

      mockInvitationActions.shareWhatsApp.mockClear();
      mockInvitationActions.markSent.mockResolvedValue(true);

      await component.retryMark();
      fixture.detectChanges();

      expect(mockInvitationActions.markSent).toHaveBeenCalledWith('inv-a');
      expect(mockInvitationActions.shareWhatsApp).not.toHaveBeenCalled();

      expect(component.current()?.id).toBe('inv-c');
      expect(component.lastOpened()).toEqual({ id: 'inv-a', groupName: 'A' });
      expect(fixture.nativeElement.querySelector('.mark-failed')).toBeNull();
      expect(fixture.nativeElement.querySelector('.last-opened')?.textContent).toContain('Se abrió el chat de A.');
    });

    it('al reintentar el marcado con falla la caja .mark-failed se queda y no vuelve a llamar shareWhatsApp', async () => {
      component.invitations.set([invitationA, invitationB, invitationC, invitationD]);
      component.loading.set(false);
      fixture.detectChanges();

      mockInvitationActions.shareWhatsApp.mockResolvedValue({ opened: true, marked: false });
      await component.sendCurrent();
      fixture.detectChanges();

      mockInvitationActions.shareWhatsApp.mockClear();
      mockInvitationActions.markSent.mockResolvedValue(false);

      await component.retryMark();
      fixture.detectChanges();

      expect(mockInvitationActions.markSent).toHaveBeenCalledWith('inv-a');
      expect(mockInvitationActions.shareWhatsApp).not.toHaveBeenCalled();

      expect(component.current()?.id).toBe('inv-a');
      expect(component.lastOpened()).toBeNull();
      expect(fixture.nativeElement.querySelector('.mark-failed')).not.toBeNull();
    });

    it('saltar por ahora borra la caja .mark-failed', async () => {
      component.invitations.set([invitationA, invitationB, invitationC, invitationD]);
      component.loading.set(false);
      fixture.detectChanges();

      mockInvitationActions.shareWhatsApp.mockResolvedValue({ opened: true, marked: false });
      await component.sendCurrent();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.mark-failed')).not.toBeNull();

      component.skipCurrent();
      fixture.detectChanges();

      expect(component.markFailed()).toBeNull();
      expect(fixture.nativeElement.querySelector('.mark-failed')).toBeNull();
      expect(component.current()?.id).toBe('inv-c');
    });

    it('no muestra .mark-failed si la invitación actual deja de coincidir con markFailed', async () => {
      component.invitations.set([invitationA, invitationB, invitationC, invitationD]);
      component.loading.set(false);
      fixture.detectChanges();

      mockInvitationActions.shareWhatsApp.mockResolvedValue({ opened: true, marked: false });
      await component.sendCurrent();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.mark-failed')).not.toBeNull();

      component.invitations.set([invitationC, invitationD]);
      fixture.detectChanges();

      expect(component.current()?.id).toBe('inv-c');
      expect(component.markFailed()?.id).toBe('inv-a');
      expect(fixture.nativeElement.querySelector('.mark-failed')).toBeNull();
    });
  });

  describe('tandas en envío en serie', () => {
    const batch1: InvitationBatchRow = {
      id: 'batch-1',
      event_id: 'evt-1',
      name: 'Tanda media',
      rsvp_deadline: '2026-11-18T23:59:59-05:00',
      created_at: '2026-10-02T00:00:00-05:00',
    };
    const batch2: InvitationBatchRow = {
      id: 'batch-2',
      event_id: 'evt-1',
      name: 'Tanda final',
      rsvp_deadline: '2026-11-24T23:59:59-05:00',
      created_at: '2026-10-03T00:00:00-05:00',
    };

    const invFirst1 = createInvitation('inv-f1', 'Familia Primera', '+573000000001', null, null);
    const invFirstOrphan = createInvitation(
      'inv-f2',
      'Familia Huérfana',
      '+573000000002',
      null,
      'batch-deleted',
    );
    const invB1 = createInvitation('inv-b1', 'Familia Media', '+573000000003', null, batch1.id);
    const invB2First = createInvitation('inv-b2-1', 'Familia Final 1', '+573000000004', null, batch2.id);
    const invB2Second = createInvitation(
      'inv-b2-2',
      'Familia Final 2',
      '+573000000005',
      null,
      batch2.id,
    );
    const invB2Third = createInvitation(
      'inv-b2-3',
      'Familia Final 3',
      '+573000000006',
      null,
      batch2.id,
    );
    const invB2Sent = createInvitation(
      'inv-b2-sent',
      'Familia Final Enviada',
      '+573000000007',
      '2026-10-10T10:00:00-05:00',
      batch2.id,
    );
    const invB2NoPhone = createInvitation(
      'inv-b2-nophone',
      'Familia Final Sin Tel',
      null,
      null,
      batch2.id,
    );

    const allBatchInvitations = [
      invFirst1,
      invFirstOrphan,
      invB1,
      invB2First,
      invB2Second,
      invB2Third,
      invB2Sent,
      invB2NoPhone,
    ];

    it('sin tandas no muestra selector y la cola funciona igual que antes', async () => {
      mockEventContext.batches.set([]);
      mockInvitationsRepo.list.mockResolvedValue([invitationA, invitationB, invitationC, invitationD]);

      component.ionViewWillEnter();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('ion-select')).toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain('Tanda');
      expect(component.queue().map((i) => i.id)).toEqual(['inv-a', 'inv-c']);
      expect(component.withPhone().map((i) => i.id)).toEqual(['inv-a', 'inv-b', 'inv-c']);
      expect(component.sentCount()).toBe(1);
      expect(component.withoutPhoneCount()).toBe(1);
    });

    it('con 2 tandas inicia en la más reciente y filtra cola, progreso y conteos por esa tanda', async () => {
      mockEventContext.batches.set([batch1, batch2]);
      mockInvitationsRepo.list.mockResolvedValue(allBatchInvitations);

      component.ionViewWillEnter();
      await fixture.whenStable();
      fixture.detectChanges();

      const selectEl = fixture.nativeElement.querySelector('ion-select');
      expect(selectEl).not.toBeNull();
      expect(component.selectedBatch()).toBe(batch2.id);

      const optionTexts = Array.from(
        fixture.nativeElement.querySelectorAll('ion-select-option'),
      ).map((el) => (el as HTMLElement).textContent?.trim());
      expect(optionTexts).toEqual(['Todas las tandas', 'Primera tanda', 'Tanda media', 'Tanda final']);

      expect(component.withPhone().map((i) => i.id)).toEqual([
        'inv-b2-1',
        'inv-b2-2',
        'inv-b2-3',
        'inv-b2-sent',
      ]);
      expect(component.queue().map((i) => i.id)).toEqual(['inv-b2-1', 'inv-b2-2', 'inv-b2-3']);
      expect(component.queue()[1].id).toBe('inv-b2-2');
      expect(component.queue()[2].id).toBe('inv-b2-3');
      expect(component.current()?.id).toBe('inv-b2-1');
      expect(component.sentCount()).toBe(1);
      expect(component.withoutPhoneCount()).toBe(1);
      expect(component.progress()).toBeCloseTo(0.25);
      expect(component.noPhoneLabel()).toBe(
        '1 invitación no tiene teléfono. Compártela desde su detalle.',
      );
      expect(fixture.nativeElement.querySelector('.progress-label')?.textContent).toContain(
        '1 de 4 enviadas',
      );
    });

    it('al elegir Primera tanda incluye las de batch_id null y las de tandas inexistentes', async () => {
      mockEventContext.batches.set([batch1, batch2]);
      mockInvitationsRepo.list.mockResolvedValue(allBatchInvitations);

      component.ionViewWillEnter();
      await fixture.whenStable();
      fixture.detectChanges();

      component.onBatchChange(new CustomEvent('ionChange', { detail: { value: 'first' } }));
      fixture.detectChanges();

      expect(component.selectedBatch()).toBe('first');
      expect(component.queue().map((i) => i.id)).toEqual(['inv-f1', 'inv-f2']);
      expect(component.queue()[1].id).toBe('inv-f2');
      expect(component.withPhone().length).toBe(2);
      expect(component.withoutPhoneCount()).toBe(0);
      expect(component.sentCount()).toBe(0);
    });

    it('al cambiar a Todas las tandas suma las invitaciones de todas las tandas', async () => {
      mockEventContext.batches.set([batch1, batch2]);
      mockInvitationsRepo.list.mockResolvedValue(allBatchInvitations);

      component.ionViewWillEnter();
      await fixture.whenStable();
      fixture.detectChanges();

      component.onBatchChange(new CustomEvent('ionChange', { detail: { value: 'all' } }));
      fixture.detectChanges();

      expect(component.selectedBatch()).toBe('all');
      expect(component.withPhone().length).toBe(7);
      expect(component.withoutPhoneCount()).toBe(1);
      expect(component.sentCount()).toBe(1);
      expect(component.queue().map((i) => i.id)).toEqual([
        'inv-f1',
        'inv-f2',
        'inv-b1',
        'inv-b2-1',
        'inv-b2-2',
        'inv-b2-3',
      ]);
      expect(component.progress()).toBeCloseTo(1 / 7);
    });

    it('saltar una invitación, cambiar de tanda y volver la mantiene al final de la cola', async () => {
      mockEventContext.batches.set([batch1, batch2]);
      mockInvitationsRepo.list.mockResolvedValue(allBatchInvitations);

      component.ionViewWillEnter();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.current()?.id).toBe('inv-b2-1');
      component.skipCurrent();
      fixture.detectChanges();
      expect(component.queue().map((i) => i.id)).toEqual(['inv-b2-2', 'inv-b2-3', 'inv-b2-1']);

      component.onBatchChange(new CustomEvent('ionChange', { detail: { value: batch1.id } }));
      fixture.detectChanges();
      expect(component.queue().map((i) => i.id)).toEqual(['inv-b1']);

      component.onBatchChange(new CustomEvent('ionChange', { detail: { value: batch2.id } }));
      fixture.detectChanges();
      expect(component.current()?.id).toBe('inv-b2-2');
      expect(component.queue().map((i) => i.id)).toEqual(['inv-b2-2', 'inv-b2-3', 'inv-b2-1']);
    });

    it('si la tanda elegida se borra mientras la página está abierta vuelve a Todas las tandas', async () => {
      mockEventContext.batches.set([batch1, batch2]);
      mockInvitationsRepo.list.mockResolvedValue(allBatchInvitations);

      component.ionViewWillEnter();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.selectedBatch()).toBe(batch2.id);

      mockEventContext.batches.set([batch1]);
      fixture.detectChanges();

      expect(component.selectedBatch()).toBe('all');
      expect(component.withPhone().length).toBe(7);
      expect(component.queue().map((i) => i.id)).toEqual([
        'inv-f1',
        'inv-f2',
        'inv-b1',
        'inv-b2-1',
        'inv-b2-2',
        'inv-b2-3',
      ]);
    });

    it('previewText pasa la invitación de la tanda actual a whatsAppMessage', async () => {
      mockEventContext.batches.set([batch1, batch2]);
      mockInvitationsRepo.list.mockResolvedValue(allBatchInvitations);

      component.ionViewWillEnter();
      await fixture.whenStable();
      fixture.detectChanges();

      const preview = component.previewText();
      expect(preview).toBe('Hola A, te invitamos a nuestro evento.');
      expect(mockInvitationActions.whatsAppMessage).toHaveBeenCalledWith(invB2First, mockEvent);
    });
  });
});
