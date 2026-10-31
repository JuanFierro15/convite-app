import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import {
  GuestApiError,
  GuestApiService,
  GuestGift,
  GuestInvitation,
} from '../../../core';
import { GuestGiftsPage } from './guest-gifts.page';

const mockGroupInvitation: GuestInvitation = {
  invitation: {
    id: 'inv-group-1',
    group_name: 'Familia Gómez',
    code: 'ABCD1234JK',
    kind: 'group',
  },
  event: {
    name: 'Baby Shower de Martina',
    theme_id: 'baby-shower',
    starts_at: '2026-11-29T15:00:00-05:00',
    venue_name: 'Club Campestre',
    venue_address: 'Calle 10 # 5-20',
    city: 'Neiva',
    map_url: null,
    welcome_message: null,
    rsvp_deadline: '2026-11-15T23:59:59-05:00',
  },
  guests: [{ id: 'g-1', full_name: 'Carlos Gómez', rsvp: 'accepted' }],
  can_respond: true,
  gifts_open: true,
};

const mockIndividualInvitation: GuestInvitation = {
  invitation: {
    id: 'inv-ind-1',
    group_name: 'Laura Peña',
    code: 'WXYZ5678LM',
    kind: 'individual',
  },
  event: {
    name: 'Baby Shower de Martina',
    theme_id: 'baby-shower',
    starts_at: '2026-11-29T15:00:00-05:00',
    venue_name: 'Club Campestre',
    venue_address: 'Calle 10 # 5-20',
    city: 'Neiva',
    map_url: null,
    welcome_message: null,
    rsvp_deadline: '2026-11-15T23:59:59-05:00',
  },
  guests: [{ id: 'g-2', full_name: 'Laura Peña', rsvp: 'accepted' }],
  can_respond: true,
  gifts_open: true,
};

const mockGifts: GuestGift[] = [
  {
    id: 'gift-1',
    name: 'Coche para bebé',
    description: 'Color gris o neutro',
    category: 'Paseo',
    kind: 'unique',
    reserved_by_me: true,
    taken: true,
    remaining: null,
    full: false,
    max_reservations: null,
  },
];

describe('GuestGiftsPage', () => {
  let fixture: ComponentFixture<GuestGiftsPage>;
  let component: GuestGiftsPage;
  let mockGuestApi: {
    getInvitation: ReturnType<typeof vi.fn>;
    getGifts: ReturnType<typeof vi.fn>;
    reserveGift: ReturnType<typeof vi.fn>;
    releaseGift: ReturnType<typeof vi.fn>;
  };
  let alertController: AlertController;
  let mockToastController: {
    create: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockGuestApi = {
      getInvitation: vi.fn(),
      getGifts: vi.fn(),
      reserveGift: vi.fn(),
      releaseGift: vi.fn(),
    };
    mockToastController = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
      }),
    };

    await TestBed.configureTestingModule({
      imports: [GuestGiftsPage],
      providers: [
        provideRouter([]),
        { provide: GuestApiService, useValue: mockGuestApi },
        { provide: ToastController, useValue: mockToastController },
      ],
    }).compileComponents();

    alertController = TestBed.inject(AlertController);
  });

  it('renders "Su regalo" for group invitation with 1 gift', async () => {
    mockGuestApi.getInvitation.mockResolvedValue(mockGroupInvitation);
    mockGuestApi.getGifts.mockResolvedValue(mockGifts);

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'ABCD1234JK');

    await component.loadData();
    fixture.detectChanges();

    const headingEl = fixture.nativeElement.querySelector('#section-mine');
    expect(headingEl?.textContent?.trim()).toBe('Su regalo');

    const badgeEl = fixture.nativeElement.querySelector('.gift-card .badge-soft-success');
    expect(badgeEl?.textContent?.trim()).toBe('Su elección');
  });

  it('renders "Tu regalo" for individual invitation with 1 gift', async () => {
    mockGuestApi.getInvitation.mockResolvedValue(mockIndividualInvitation);
    mockGuestApi.getGifts.mockResolvedValue(mockGifts);

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'WXYZ5678LM');

    await component.loadData();
    fixture.detectChanges();

    const headingEl = fixture.nativeElement.querySelector('#section-mine');
    expect(headingEl?.textContent?.trim()).toBe('Tu regalo');

    const badgeEl = fixture.nativeElement.querySelector('.gift-card .badge-soft-success');
    expect(badgeEl?.textContent?.trim()).toBe('Tu elección');
  });

  it('prompts confirmation with "Alguien más podrá elegirlo" when releasing', async () => {
    mockGuestApi.getInvitation.mockResolvedValue(mockGroupInvitation);
    mockGuestApi.getGifts.mockResolvedValue(mockGifts);

    const alertCreateSpy = vi.spyOn(alertController, 'create').mockResolvedValue({
      present: vi.fn().mockResolvedValue(undefined),
    } as unknown as HTMLIonAlertElement);

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'ABCD1234JK');

    await component.loadData();
    await component.onConfirmRelease(mockGifts[0]);

    expect(alertCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        header: 'Liberar regalo',
        message: '¿Liberar Coche para bebé? Alguien más podrá elegirlo.',
      }),
    );
  });

  it('prompts confirmation with reserveGiftConfirm when reserving', async () => {
    mockGuestApi.getInvitation.mockResolvedValue(mockIndividualInvitation);
    const unreservedGift: GuestGift = {
      id: 'g-2',
      name: 'Silla para carro',
      description: null,
      category: null,
      kind: 'unique',
      reserved_by_me: false,
      taken: false,
      remaining: null,
      full: false,
      max_reservations: null,
    };
    mockGuestApi.getGifts.mockResolvedValue([unreservedGift]);

    const alertCreateSpy = vi.spyOn(alertController, 'create').mockResolvedValue({
      present: vi.fn().mockResolvedValue(undefined),
    } as unknown as HTMLIonAlertElement);

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'WXYZ5678LM');

    await component.loadData();
    await component.onConfirmReserve(unreservedGift);

    expect(alertCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        header: 'Elegir regalo',
        message: '¿Quieres elegir Silla para carro? Nadie más sabrá que lo elegiste tú.',
      }),
    );
  });

  it('card agotada sin botón y con "Ya lo eligieron"; card elegida con "Tu elección" y "Liberar"; "Quedan 2 de 3" en un repetible', async () => {
    const soldOutGift: GuestGift = {
      id: 'gift-sold',
      name: 'Mochila pañalera',
      description: null,
      category: null,
      kind: 'unique',
      reserved_by_me: false,
      taken: true,
      remaining: null,
      full: false,
      max_reservations: null,
    };
    const chosenGift: GuestGift = {
      id: 'gift-chosen',
      name: 'Biberones',
      description: null,
      category: null,
      kind: 'repeatable',
      reserved_by_me: true,
      taken: false,
      remaining: 1,
      full: false,
      max_reservations: 3,
    };
    const availableRepeatable: GuestGift = {
      id: 'gift-rep',
      name: 'Pañales etapa 1',
      description: null,
      category: null,
      kind: 'repeatable',
      reserved_by_me: false,
      taken: false,
      remaining: 2,
      full: false,
      max_reservations: 3,
    };

    mockGuestApi.getInvitation.mockResolvedValue(mockIndividualInvitation);
    mockGuestApi.getGifts.mockResolvedValue([
      soldOutGift,
      chosenGift,
      availableRepeatable,
    ]);

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'WXYZ5678LM');

    await component.loadData();
    // Default filter opens in repeatable; switch to repeatable to see availableRepeatable
    fixture.detectChanges();

    // Check chosen gift in "Tu regalo"
    const chosenEl = fixture.nativeElement.querySelector('.gift-section--mine .gift-card');
    expect(chosenEl?.textContent).toContain('Tu elección');
    const releaseBtn = chosenEl?.querySelector('ion-button');
    expect(releaseBtn?.textContent).toContain('Liberar');

    // In repeatable category, availableRepeatable is visible
    const repEl = fixture.nativeElement.querySelector('.gift-card__remaining');
    expect(repEl?.textContent?.trim()).toBe('Quedan 2 de 3');

    // Switch to unique filter to inspect sold out card
    component.onFilterChange(new CustomEvent('ionChange', { detail: { value: 'unique' } }));
    fixture.detectChanges();

    const soldCard = fixture.nativeElement.querySelector('.gift-card--sold-out');
    expect(soldCard).not.toBeNull();
    expect(soldCard?.textContent).toContain('Ya lo eligieron');
    expect(soldCard?.querySelector('ion-button')).toBeNull();
  });

  it('si reserveGift falla con gift_full, se muestra el mensaje y se recarga la lista', async () => {
    mockGuestApi.getInvitation.mockResolvedValue(mockGroupInvitation);
    mockGuestApi.getGifts.mockResolvedValue([
      {
        id: 'gift-rep',
        name: 'Pañales etapa 1',
        description: null,
        category: null,
        kind: 'repeatable',
        reserved_by_me: false,
        taken: false,
        remaining: 1,
        full: false,
        max_reservations: 2,
      },
    ]);

    mockGuestApi.reserveGift.mockRejectedValue(new GuestApiError('gift_full'));

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'ABCD1234JK');

    await component.loadData();
    mockGuestApi.getGifts.mockClear();

    await component.executeReserve('gift-rep');

    expect(mockToastController.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Este regalo ya completó sus cupos. Elige otro de la lista.',
        color: 'danger',
      }),
    );
    expect(mockGuestApi.getGifts).toHaveBeenCalledWith('ABCD1234JK');
  });

  it('renders anonymity banner with plural text for group invitations', async () => {
    mockGuestApi.getInvitation.mockResolvedValue(mockGroupInvitation);
    mockGuestApi.getGifts.mockResolvedValue(mockGifts);

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'ABCD1234JK');

    await component.loadData();
    fixture.detectChanges();

    const bannerEl = fixture.nativeElement.querySelector('.anonymity-banner');
    expect(bannerEl).not.toBeNull();
    expect(bannerEl?.textContent?.trim()).toBe(
      'Lo que elijan es anónimo: ni nosotros ni los demás invitados sabremos qué regalo eligieron. Solo les pedimos elegirlo para que los regalos no se repitan.',
    );
  });

  it('renders anonymity banner with singular text for individual invitations', async () => {
    mockGuestApi.getInvitation.mockResolvedValue(mockIndividualInvitation);
    mockGuestApi.getGifts.mockResolvedValue(mockGifts);

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'WXYZ5678LM');

    await component.loadData();
    fixture.detectChanges();

    const bannerEl = fixture.nativeElement.querySelector('.anonymity-banner');
    expect(bannerEl).not.toBeNull();
    expect(bannerEl?.textContent?.trim()).toBe(
      'Lo que elijas es anónimo: ni nosotros ni los demás invitados sabremos qué regalo elegiste. Solo te pedimos elegirlo para que los regalos no se repitan.',
    );
  });

  it('renders reserved confirmation text matching giftReservedConfirmation without the group name', async () => {
    mockGuestApi.getInvitation.mockResolvedValue(mockGroupInvitation);
    mockGuestApi.getGifts.mockResolvedValue(mockGifts);
    mockGuestApi.reserveGift.mockResolvedValue(mockGifts);

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'ABCD1234JK');

    await component.loadData();
    await component.executeReserve('gift-1');
    fixture.detectChanges();

    const confirmationEl = fixture.nativeElement.querySelector(
      '.reserved-confirmation-card__text',
    );
    expect(confirmationEl).not.toBeNull();
    expect(confirmationEl?.textContent?.trim()).toBe(
      '¡Listo! Quedó elegido. Solo ustedes saben que lo eligieron.',
    );
    expect(confirmationEl?.textContent).not.toContain(mockGroupInvitation.invitation.group_name);
  });

  it('abre en Repetibles con los conteos correctos; al tocar Únicos cambia la lista y vuelve a la página 1', async () => {
    const list: GuestGift[] = [
      {
        id: 'u-1',
        name: 'Coche',
        description: null,
        category: null,
        kind: 'unique',
        reserved_by_me: false,
        taken: false,
        remaining: null,
        full: false,
        max_reservations: null,
      },
      {
        id: 'u-2',
        name: 'Cuna',
        description: null,
        category: null,
        kind: 'unique',
        reserved_by_me: false,
        taken: false,
        remaining: null,
        full: false,
        max_reservations: null,
      },
      {
        id: 'r-1',
        name: 'Pañales',
        description: null,
        category: null,
        kind: 'repeatable',
        reserved_by_me: false,
        taken: false,
        remaining: 2,
        full: false,
        max_reservations: 3,
      },
    ];

    mockGuestApi.getInvitation.mockResolvedValue(mockIndividualInvitation);
    mockGuestApi.getGifts.mockResolvedValue(list);

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'WXYZ5678LM');

    await component.loadData();
    fixture.detectChanges();

    expect(component.preferredFilter()).toBe('repeatable');
    expect(component.activeCategory()).toBe('repeatable');
    expect(component.showFilter()).toBe(true);
    expect(component.counts()).toEqual({ unique: 2, repeatable: 1 });
    expect(component.visible().length).toBe(1);
    expect(component.visible()[0].id).toBe('r-1');

    // Cambiar a Únicos
    component.onFilterChange(new CustomEvent('ionChange', { detail: { value: 'unique' } }));
    fixture.detectChanges();

    expect(component.preferredFilter()).toBe('unique');
    expect(component.activeCategory()).toBe('unique');
    expect(component.page()).toBe(1);
    expect(component.visible().length).toBe(2);
    expect(component.visible().map((g) => g.id)).toEqual(['u-1', 'u-2']);
  });

  it('con sugerencias, la card .basics-card aparece antes del aviso de anonimato, muestra el título exacto, un li por sugerencia sin descripción y sin botones', async () => {
    const list: GuestGift[] = [
      {
        id: 'r-1',
        name: 'Pañales',
        description: null,
        category: null,
        kind: 'repeatable',
        reserved_by_me: false,
        taken: false,
        remaining: 2,
        full: false,
        max_reservations: 3,
      },
      {
        id: 's-1',
        name: 'Libro de cuentos',
        description: 'Cualquier edición ilustrada',
        category: null,
        kind: 'suggestion',
        reserved_by_me: false,
        taken: false,
        remaining: null,
        full: false,
        max_reservations: null,
      },
      {
        id: 's-2',
        name: 'Ropa de 3 a 6 meses',
        description: 'Colores pastel',
        category: null,
        kind: 'suggestion',
        reserved_by_me: false,
        taken: false,
        remaining: null,
        full: false,
        max_reservations: null,
      },
    ];

    mockGuestApi.getInvitation.mockResolvedValue(mockIndividualInvitation);
    mockGuestApi.getGifts.mockResolvedValue(list);

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'WXYZ5678LM');

    await component.loadData();
    fixture.detectChanges();

    const basicsCard = fixture.nativeElement.querySelector('.basics-card');
    const anonymityBanner = fixture.nativeElement.querySelector('.anonymity-banner');
    expect(basicsCard).not.toBeNull();
    expect(anonymityBanner).not.toBeNull();

    const children = Array.from(fixture.nativeElement.querySelector('.gifts-body').children);
    const basicsIndex = children.indexOf(basicsCard);
    const anonymityIndex = children.indexOf(anonymityBanner);
    expect(basicsIndex).toBeGreaterThan(-1);
    expect(anonymityIndex).toBeGreaterThan(basicsIndex);

    const titleEl = basicsCard.querySelector('.basics-card__title');
    expect(titleEl?.textContent?.trim()).toBe('Básicos que nunca sobran, tráelos si quieres');

    const items = basicsCard.querySelectorAll('.basics-card__item');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('Libro de cuentos');
    expect(items[0].textContent).not.toContain('Cualquier edición ilustrada');
    expect(items[1].textContent).toContain('Ropa de 3 a 6 meses');
    expect(items[1].textContent).not.toContain('Colores pastel');
    expect(basicsCard.querySelectorAll('.basics-card__item ion-icon').length).toBe(0);

    expect(basicsCard.querySelectorAll('ion-button').length).toBe(0);
  });

  it('la card .basics-card aparece también con el filtro Únicos activo', async () => {
    const list: GuestGift[] = [
      {
        id: 'u-1',
        name: 'Cuna de viaje',
        description: null,
        category: null,
        kind: 'unique',
        reserved_by_me: false,
        taken: false,
        remaining: null,
        full: false,
        max_reservations: null,
      },
      {
        id: 'r-1',
        name: 'Pañales',
        description: null,
        category: null,
        kind: 'repeatable',
        reserved_by_me: false,
        taken: false,
        remaining: 2,
        full: false,
        max_reservations: 3,
      },
      {
        id: 's-1',
        name: 'Toallitas húmedas',
        description: 'Sin fragancia',
        category: null,
        kind: 'suggestion',
        reserved_by_me: false,
        taken: false,
        remaining: null,
        full: false,
        max_reservations: null,
      },
    ];

    mockGuestApi.getInvitation.mockResolvedValue(mockIndividualInvitation);
    mockGuestApi.getGifts.mockResolvedValue(list);

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'WXYZ5678LM');

    await component.loadData();
    fixture.detectChanges();

    component.onFilterChange(new CustomEvent('ionChange', { detail: { value: 'unique' } }));
    fixture.detectChanges();

    expect(component.activeCategory()).toBe('unique');
    const basicsCard = fixture.nativeElement.querySelector('.basics-card');
    expect(basicsCard).not.toBeNull();
    expect(basicsCard.textContent).toContain('Toallitas húmedas');
  });

  it('sin sugerencias, la card .basics-card no aparece', async () => {
    mockGuestApi.getInvitation.mockResolvedValue(mockIndividualInvitation);
    mockGuestApi.getGifts.mockResolvedValue(mockGifts);

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'WXYZ5678LM');

    await component.loadData();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.basics-card')).toBeNull();
  });

  it('con 8 repetibles disponibles hay 2 páginas; "Siguiente" muestra 2 cards y "Página 2 de 2"', async () => {
    const list: GuestGift[] = Array.from({ length: 8 }, (_, i) => ({
      id: `rep-${i + 1}`,
      name: `Repetible ${i + 1}`,
      description: null,
      category: null,
      kind: 'repeatable',
      reserved_by_me: false,
      taken: false,
      remaining: 2,
      full: false,
      max_reservations: 3,
    }));

    mockGuestApi.getInvitation.mockResolvedValue(mockIndividualInvitation);
    mockGuestApi.getGifts.mockResolvedValue(list);

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'WXYZ5678LM');

    await component.loadData();
    fixture.detectChanges();

    expect(component.paged().totalPages).toBe(2);
    expect(component.paged().page).toBe(1);
    expect(component.paged().items.length).toBe(6);

    component.goToNextPage();
    fixture.detectChanges();

    expect(component.paged().page).toBe(2);
    expect(component.paged().items.length).toBe(2);

    const statusEl = fixture.nativeElement.querySelector('.pagination__status');
    expect(statusEl?.textContent?.trim()).toBe('Página 2 de 2');
  });

  it('elegir el único regalo de la última página lo pasa a "Tu regalo" y la página retrocede', async () => {
    const list: GuestGift[] = Array.from({ length: 7 }, (_, i) => ({
      id: `rep-${i + 1}`,
      name: `Repetible ${i + 1}`,
      description: null,
      category: null,
      kind: 'repeatable',
      reserved_by_me: false,
      taken: false,
      remaining: 2,
      full: false,
      max_reservations: 3,
    }));

    mockGuestApi.getInvitation.mockResolvedValue(mockIndividualInvitation);
    mockGuestApi.getGifts.mockResolvedValue(list);

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'WXYZ5678LM');
    fixture.detectChanges();
    await component.loadData();
    fixture.detectChanges();

    component.goToNextPage(); // pasa a página 2
    fixture.detectChanges();

    expect(component.paged().page).toBe(2);
    expect(component.paged().items.map((g) => g.id)).toEqual(['rep-7']);

    // Al reservar rep-7
    const updated = list.map((g) => (g.id === 'rep-7' ? { ...g, reserved_by_me: true } : g));
    mockGuestApi.reserveGift.mockResolvedValue(updated);

    await component.executeReserve('rep-7');
    fixture.detectChanges();

    expect(component.paged().page).toBe(1);
    expect(component.mine().map((g) => g.id)).toEqual(['rep-7']);
    expect(component.visible().length).toBe(6);
  });

  it('una respuesta de reserveGift que marca como agotado un regalo visible no lo mueve de sitio', async () => {
    const g1: GuestGift = {
      id: 'g-1',
      name: 'Regalo 1',
      description: null,
      category: null,
      kind: 'repeatable',
      reserved_by_me: false,
      taken: false,
      remaining: 1,
      full: false,
      max_reservations: 2,
    };
    const g2: GuestGift = {
      id: 'g-2',
      name: 'Regalo 2',
      description: null,
      category: null,
      kind: 'repeatable',
      reserved_by_me: false,
      taken: false,
      remaining: 1,
      full: false,
      max_reservations: 2,
    };
    const g3: GuestGift = {
      id: 'g-3',
      name: 'Regalo 3',
      description: null,
      category: null,
      kind: 'repeatable',
      reserved_by_me: false,
      taken: false,
      remaining: 1,
      full: false,
      max_reservations: 2,
    };

    mockGuestApi.getInvitation.mockResolvedValue(mockIndividualInvitation);
    mockGuestApi.getGifts.mockResolvedValue([g1, g2, g3]);

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'WXYZ5678LM');
    fixture.detectChanges();
    await component.loadData();
    fixture.detectChanges();

    // Simula que al reservar g1, el backend reporta que g2 se agotó por otra persona
    const updated = [
      { ...g1, reserved_by_me: true },
      { ...g2, full: true, remaining: 0 },
      g3,
    ];
    mockGuestApi.reserveGift.mockResolvedValue(updated);

    await component.executeReserve('g-1');
    fixture.detectChanges();

    // g1 pasó a "mine", mientras que g2 (agotado) y g3 conservan su orden inicial
    expect(component.visible().map((g) => g.id)).toEqual(['g-2', 'g-3']);
    expect(component.visible()[0].full).toBe(true);
  });

  it('con un envelope con descripción, aparece .envelope-card con el título "Lluvia de sobres" y la descripción', async () => {
    const envelopeGift: GuestGift = {
      id: 'env-1',
      name: 'Lluvia de sobres',
      description: 'Lluvia de sobres para la alcancía de Martina',
      category: null,
      kind: 'envelope',
      reserved_by_me: false,
      taken: false,
      remaining: null,
      full: false,
      max_reservations: null,
    };
    mockGuestApi.getInvitation.mockResolvedValue(mockGroupInvitation);
    mockGuestApi.getGifts.mockResolvedValue([envelopeGift]);

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'ABCD1234JK');

    await component.loadData();
    fixture.detectChanges();

    const envelopeCard = fixture.nativeElement.querySelector('.envelope-card');
    expect(envelopeCard).not.toBeNull();
    const titleEl = envelopeCard.querySelector('.envelope-card__title');
    expect(titleEl?.textContent?.trim()).toBe('Lluvia de sobres');
    const textEl = envelopeCard.querySelector('.envelope-card__text');
    expect(textEl?.textContent?.trim()).toBe('Lluvia de sobres para la alcancía de Martina');
  });

  it('con descripción vacía o solo espacios, muestra el texto por defecto de grupo o individual', async () => {
    const emptyDescEnvelope: GuestGift = {
      id: 'env-1',
      name: 'Lluvia de sobres',
      description: '   ',
      category: null,
      kind: 'envelope',
      reserved_by_me: false,
      taken: false,
      remaining: null,
      full: false,
      max_reservations: null,
    };

    // Caso grupo
    mockGuestApi.getInvitation.mockResolvedValue(mockGroupInvitation);
    mockGuestApi.getGifts.mockResolvedValue([emptyDescEnvelope]);

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'ABCD1234JK');

    await component.loadData();
    fixture.detectChanges();

    let textEl = fixture.nativeElement.querySelector('.envelope-card__text');
    expect(textEl?.textContent?.trim()).toBe(
      'Si prefieren hacer un aporte en sobre, el día del evento habrá un lugar para dejarlo.',
    );

    // Caso individual (con descripción null)
    const nullDescEnvelope: GuestGift = { ...emptyDescEnvelope, description: null };
    mockGuestApi.getInvitation.mockResolvedValue(mockIndividualInvitation);
    mockGuestApi.getGifts.mockResolvedValue([nullDescEnvelope]);

    const indFixture = TestBed.createComponent(GuestGiftsPage);
    const indComponent = indFixture.componentInstance;
    indFixture.componentRef.setInput('code', 'WXYZ5678LM');

    await indComponent.loadData();
    indFixture.detectChanges();

    textEl = indFixture.nativeElement.querySelector('.envelope-card__text');
    expect(textEl?.textContent?.trim()).toBe(
      'Si prefieres hacer un aporte en sobre, el día del evento habrá un lugar para dejarlo.',
    );
  });

  it('sin envelope, no hay .envelope-card', async () => {
    mockGuestApi.getInvitation.mockResolvedValue(mockIndividualInvitation);
    mockGuestApi.getGifts.mockResolvedValue(mockGifts);

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'WXYZ5678LM');

    await component.loadData();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.envelope-card')).toBeNull();
  });

  it('la card de básicos no muestra la lluvia de sobres aunque haya sugerencias y envelope a la vez', async () => {
    const list: GuestGift[] = [
      {
        id: 's-1',
        name: 'Pañales ecológicos',
        description: null,
        category: null,
        kind: 'suggestion',
        reserved_by_me: false,
        taken: false,
        remaining: null,
        full: false,
        max_reservations: null,
      },
      {
        id: 'env-1',
        name: 'Lluvia de sobres',
        description: null,
        category: null,
        kind: 'envelope',
        reserved_by_me: false,
        taken: false,
        remaining: null,
        full: false,
        max_reservations: null,
      },
    ];

    mockGuestApi.getInvitation.mockResolvedValue(mockGroupInvitation);
    mockGuestApi.getGifts.mockResolvedValue(list);

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'ABCD1234JK');

    await component.loadData();
    fixture.detectChanges();

    const basicsCard = fixture.nativeElement.querySelector('.basics-card');
    expect(basicsCard).not.toBeNull();
    expect(basicsCard?.textContent).toContain('Pañales ecológicos');
    expect(basicsCard?.textContent).not.toContain('Lluvia de sobres');
  });

  it('la card de lluvia de sobres se ve con el filtro en "Únicos" y en la otra categoría', async () => {
    const list: GuestGift[] = [
      {
        id: 'u-1',
        name: 'Cuna',
        description: null,
        category: null,
        kind: 'unique',
        reserved_by_me: false,
        taken: false,
        remaining: null,
        full: false,
        max_reservations: null,
      },
      {
        id: 'r-1',
        name: 'Pañales',
        description: null,
        category: null,
        kind: 'repeatable',
        reserved_by_me: false,
        taken: false,
        remaining: 2,
        full: false,
        max_reservations: 3,
      },
      {
        id: 'env-1',
        name: 'Lluvia de sobres',
        description: 'Aporte en sobre',
        category: null,
        kind: 'envelope',
        reserved_by_me: false,
        taken: false,
        remaining: null,
        full: false,
        max_reservations: null,
      },
    ];

    mockGuestApi.getInvitation.mockResolvedValue(mockIndividualInvitation);
    mockGuestApi.getGifts.mockResolvedValue(list);

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'WXYZ5678LM');

    await component.loadData();
    fixture.detectChanges();

    expect(component.activeCategory()).toBe('repeatable');
    expect(fixture.nativeElement.querySelector('.envelope-card')).not.toBeNull();

    component.onFilterChange(new CustomEvent('ionChange', { detail: { value: 'unique' } }));
    fixture.detectChanges();

    expect(component.activeCategory()).toBe('unique');
    expect(fixture.nativeElement.querySelector('.envelope-card')).not.toBeNull();
  });

  it('la .envelope-card está en el DOM después de .basics-card y antes de .anonymity-banner', async () => {
    const list: GuestGift[] = [
      {
        id: 's-1',
        name: 'Toallitas húmedas',
        description: null,
        category: null,
        kind: 'suggestion',
        reserved_by_me: false,
        taken: false,
        remaining: null,
        full: false,
        max_reservations: null,
      },
      {
        id: 'env-1',
        name: 'Lluvia de sobres',
        description: 'Aporte libre',
        category: null,
        kind: 'envelope',
        reserved_by_me: false,
        taken: false,
        remaining: null,
        full: false,
        max_reservations: null,
      },
    ];

    mockGuestApi.getInvitation.mockResolvedValue(mockGroupInvitation);
    mockGuestApi.getGifts.mockResolvedValue(list);

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'ABCD1234JK');

    await component.loadData();
    fixture.detectChanges();

    const basicsCard = fixture.nativeElement.querySelector('.basics-card');
    const envelopeCard = fixture.nativeElement.querySelector('.envelope-card');
    const anonymityBanner = fixture.nativeElement.querySelector('.anonymity-banner');

    expect(basicsCard).not.toBeNull();
    expect(envelopeCard).not.toBeNull();
    expect(anonymityBanner).not.toBeNull();

    const children = Array.from(fixture.nativeElement.querySelector('.gifts-body').children);
    const basicsIndex = children.indexOf(basicsCard);
    const envelopeIndex = children.indexOf(envelopeCard);
    const anonymityIndex = children.indexOf(anonymityBanner);

    expect(basicsIndex).toBeGreaterThan(-1);
    expect(envelopeIndex).toBeGreaterThan(basicsIndex);
    expect(anonymityIndex).toBeGreaterThan(envelopeIndex);
  });

  it('no hay ningún botón dentro de la .envelope-card', async () => {
    const envelopeGift: GuestGift = {
      id: 'env-1',
      name: 'Lluvia de sobres',
      description: 'Aporte voluntario',
      category: null,
      kind: 'envelope',
      reserved_by_me: false,
      taken: false,
      remaining: null,
      full: false,
      max_reservations: null,
    };

    mockGuestApi.getInvitation.mockResolvedValue(mockGroupInvitation);
    mockGuestApi.getGifts.mockResolvedValue([envelopeGift]);

    fixture = TestBed.createComponent(GuestGiftsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'ABCD1234JK');

    await component.loadData();
    fixture.detectChanges();

    const envelopeCard = fixture.nativeElement.querySelector('.envelope-card');
    expect(envelopeCard).not.toBeNull();
    expect(envelopeCard.querySelectorAll('ion-button').length).toBe(0);
    expect(envelopeCard.querySelectorAll('button').length).toBe(0);
  });
});
