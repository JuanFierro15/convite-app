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

function buildUniqueGift(overrides: Partial<GuestGift> = {}): GuestGift {
  return {
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
    ...overrides,
  };
}

function buildSuggestionGift(overrides: Partial<GuestGift> = {}): GuestGift {
  return {
    id: 's-1',
    name: 'Pañales',
    description: null,
    category: null,
    kind: 'suggestion',
    reserved_by_me: false,
    taken: false,
    remaining: null,
    full: false,
    max_reservations: null,
    ...overrides,
  };
}

function buildEnvelopeGift(overrides: Partial<GuestGift> = {}): GuestGift {
  return {
    id: 'env-1',
    name: 'Sobres',
    description: 'Aporte voluntario',
    category: null,
    kind: 'envelope',
    reserved_by_me: false,
    taken: false,
    remaining: null,
    full: false,
    max_reservations: null,
    ...overrides,
  };
}

describe('GuestGiftsPage', () => {
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

  async function createPage(gifts: GuestGift[], inv: GuestInvitation = mockGroupInvitation) {
    mockGuestApi.getInvitation.mockResolvedValue(inv);
    mockGuestApi.getGifts.mockResolvedValue(gifts);

    const fixture = TestBed.createComponent(GuestGiftsPage);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('code', inv.invitation.code);
    fixture.detectChanges();
    await component.loadData();
    fixture.detectChanges();
    return { fixture, component };
  }

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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a.back-link with routerLink to /i/<code\> and no ion-button back button', async () => {
    const { fixture } = await createPage(mockGifts, mockGroupInvitation);

    const backLink = fixture.nativeElement.querySelector('a.back-link');
    expect(backLink).not.toBeNull();
    expect(backLink?.textContent).toContain('Volver a la invitación');
    expect(backLink?.querySelector('ion-icon[name="arrow-back-outline"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('ion-button.back-button')).toBeNull();
  });

  it('renders elements in correct DOM order with list, basics and envelope: back-link, header, list-section, divider, basics, envelope', async () => {
    const list: GuestGift[] = [
      buildUniqueGift({ id: 'u-1' }),
      buildSuggestionGift({ id: 's-1' }),
      buildEnvelopeGift({ id: 'env-1' }),
    ];

    const { fixture } = await createPage(list, mockGroupInvitation);

    const bodyChildren = Array.from(fixture.nativeElement.querySelector('.gifts-body').children);
    const backLink = fixture.nativeElement.querySelector('.back-link');
    const header = fixture.nativeElement.querySelector('.gifts-header');
    const listSection = fixture.nativeElement.querySelector('.gift-list-section');
    const divider = fixture.nativeElement.querySelector('.others-divider');
    const basics = fixture.nativeElement.querySelector('.basics-card');
    const envelope = fixture.nativeElement.querySelector('.envelope-card');

    expect(backLink).not.toBeNull();
    expect(header).not.toBeNull();
    expect(listSection).not.toBeNull();
    expect(divider).not.toBeNull();
    expect(basics).not.toBeNull();
    expect(envelope).not.toBeNull();

    const indices = [
      bodyChildren.indexOf(backLink),
      bodyChildren.indexOf(header),
      bodyChildren.indexOf(listSection),
      bodyChildren.indexOf(divider),
      bodyChildren.indexOf(basics),
      bodyChildren.indexOf(envelope),
    ];

    for (let i = 0; i < indices.length - 1; i++) {
      expect(indices[i]).toBeGreaterThan(-1);
      expect(indices[i + 1]).toBeGreaterThan(indices[i]);
    }
  });

  describe('cabecera', () => {
    it('muestra h1 con "Un detalle para Eloise", intro con lista y aviso de anonimato para grupo e individual', async () => {
      const { fixture: groupFixture } = await createPage([buildUniqueGift()], mockGroupInvitation);

      const headerTitle = groupFixture.nativeElement.querySelector('#gifts-title');
      expect(headerTitle?.textContent?.trim()).toBe('Un detalle para Eloise');

      const introEl = groupFixture.nativeElement.querySelector('.gifts-header__intro');
      expect(introEl?.textContent?.trim()).toBe(
        'Su compañía es el mejor regalo. Si les hace ilusión llevar algo, elijan de la lista para que los regalos no se repitan.',
      );

      const noteEl = groupFixture.nativeElement.querySelector('.gifts-header__note');
      expect(noteEl).not.toBeNull();
      expect(noteEl?.textContent?.trim()).toBe(
        'Es anónimo: ni nosotros ni los demás invitados sabremos qué eligieron.',
      );

      // Individual con lista
      const { fixture: indFixture } = await createPage([buildUniqueGift()], mockIndividualInvitation);

      const indIntro = indFixture.nativeElement.querySelector('.gifts-header__intro');
      expect(indIntro?.textContent?.trim()).toBe(
        'Tu compañía es el mejor regalo. Si te hace ilusión llevar algo, elige de la lista para que los regalos no se repitan.',
      );

      const indNote = indFixture.nativeElement.querySelector('.gifts-header__note');
      expect(indNote).not.toBeNull();
      expect(indNote?.textContent?.trim()).toBe(
        'Es anónimo: ni nosotros ni los demás invitados sabremos qué elegiste.',
      );
    });

    it('sin lista muestra intro sin lista y oculta el aviso de anonimato', async () => {
      const { fixture: groupFixture } = await createPage([buildSuggestionGift()], mockGroupInvitation);

      const introEl = groupFixture.nativeElement.querySelector('.gifts-header__intro');
      expect(introEl?.textContent?.trim()).toBe(
        'Su compañía es el mejor regalo. Si les hace ilusión llevar algo, aquí tienen algunas ideas.',
      );
      expect(groupFixture.nativeElement.querySelector('.gifts-header__note')).toBeNull();

      // Individual sin lista
      const { fixture: indFixture } = await createPage([buildSuggestionGift()], mockIndividualInvitation);

      const indIntro = indFixture.nativeElement.querySelector('.gifts-header__intro');
      expect(indIntro?.textContent?.trim()).toBe(
        'Tu compañía es el mejor regalo. Si te hace ilusión llevar algo, aquí tienes algunas ideas.',
      );
      expect(indFixture.nativeElement.querySelector('.gifts-header__note')).toBeNull();
    });
  });

  describe('atajos', () => {
    it('con lista y básicos: muestra solo atajo de básicos y texto "Al final también..."', async () => {
      const { fixture } = await createPage(
        [buildUniqueGift(), buildSuggestionGift()],
        mockGroupInvitation,
      );

      expect(fixture.nativeElement.querySelector('.gifts-header__more')?.textContent?.trim()).toBe(
        'Al final también encontrarán',
      );
      expect(fixture.nativeElement.querySelector('.shortcut--basics')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.shortcut--envelope')).toBeNull();
    });

    it('con lista y sobres: muestra solo atajo de sobres', async () => {
      const { fixture } = await createPage(
        [buildUniqueGift(), buildEnvelopeGift()],
        mockGroupInvitation,
      );

      expect(fixture.nativeElement.querySelector('.gifts-header__more')?.textContent?.trim()).toBe(
        'Al final también encontrarán',
      );
      expect(fixture.nativeElement.querySelector('.shortcut--basics')).toBeNull();
      expect(fixture.nativeElement.querySelector('.shortcut--envelope')).not.toBeNull();
    });

    it('con solo lista: sin atajos ni gifts-header__more', async () => {
      const { fixture } = await createPage([buildUniqueGift()], mockGroupInvitation);

      expect(fixture.nativeElement.querySelector('.gifts-header__more')).toBeNull();
      expect(fixture.nativeElement.querySelector('.shortcuts')).toBeNull();
    });

    it('sin lista (solo básicos y sobres): sin atajos ni gifts-header__more', async () => {
      const { fixture } = await createPage(
        [buildSuggestionGift(), buildEnvelopeGift()],
        mockGroupInvitation,
      );

      expect(fixture.nativeElement.querySelector('.gifts-header__more')).toBeNull();
      expect(fixture.nativeElement.querySelector('.shortcuts')).toBeNull();
    });
  });

  describe('aviso de disponibilidad', () => {
    it('con regalos disponibles no muestra el párrafo de disponibilidad', async () => {
      const gifts19 = Array.from({ length: 19 }, (_, i) =>
        buildUniqueGift({ id: `g-${i}`, taken: false }),
      );
      const { fixture } = await createPage(gifts19, mockGroupInvitation);

      expect(fixture.nativeElement.querySelector('.gift-list-section__count')).toBeNull();
    });

    it('con un regalo disponible tampoco muestra el párrafo de disponibilidad', async () => {
      const { fixture } = await createPage([buildUniqueGift({ taken: false })], mockGroupInvitation);

      expect(fixture.nativeElement.querySelector('.gift-list-section__count')).toBeNull();
    });

    it('muestra "Ya eligieron todos los regalos de la lista" con todos elegidos', async () => {
      const { fixture } = await createPage([buildUniqueGift({ taken: true })], mockGroupInvitation);

      expect(fixture.nativeElement.querySelector('.gift-list-section__count')?.textContent?.trim()).toBe(
        'Ya eligieron todos los regalos de la lista',
      );
    });

    it('con la ventana cerrada no aparece y muestra .closed-banner', async () => {
      const invClosed = { ...mockGroupInvitation, gifts_open: false };
      const { fixture } = await createPage([buildUniqueGift({ taken: true })], invClosed);

      expect(fixture.nativeElement.querySelector('.gift-list-section__count')).toBeNull();
      expect(fixture.nativeElement.querySelector('.closed-banner')).not.toBeNull();
    });
  });

  describe('separador', () => {
    it('presente con lista y básicos', async () => {
      const { fixture } = await createPage(
        [buildUniqueGift(), buildSuggestionGift()],
        mockGroupInvitation,
      );
      expect(fixture.nativeElement.querySelector('.others-divider')).not.toBeNull();
    });

    it('presente con lista y sobres', async () => {
      const { fixture } = await createPage(
        [buildUniqueGift(), buildEnvelopeGift()],
        mockGroupInvitation,
      );
      expect(fixture.nativeElement.querySelector('.others-divider')).not.toBeNull();
    });

    it('ausente con solo lista', async () => {
      const { fixture } = await createPage([buildUniqueGift()], mockGroupInvitation);
      expect(fixture.nativeElement.querySelector('.others-divider')).toBeNull();
    });

    it('ausente sin lista', async () => {
      const { fixture } = await createPage(
        [buildSuggestionGift(), buildEnvelopeGift()],
        mockGroupInvitation,
      );
      expect(fixture.nativeElement.querySelector('.others-divider')).toBeNull();
    });
  });

  describe('básicos', () => {
    it('muestra título con giftsBasicsTitle de la variante y un li por sugerencia', async () => {
      const suggestions: GuestGift[] = [
        buildSuggestionGift({ id: 's-1', name: 'Toallitas húmedas' }),
        buildSuggestionGift({ id: 's-2', name: 'Crema antipañalitis' }),
      ];

      // Grupo
      const { fixture: groupFixture } = await createPage(suggestions, mockGroupInvitation);
      const basicsCard = groupFixture.nativeElement.querySelector('.basics-card');
      expect(basicsCard).not.toBeNull();
      expect(basicsCard.querySelector('#basics-title')?.textContent?.trim()).toBe(
        'Básicos que nunca sobran, tráiganlos si quieren',
      );

      const items = basicsCard.querySelectorAll('.basics-card__item');
      expect(items.length).toBe(2);
      expect(items[0].textContent?.trim()).toBe('Toallitas húmedas');
      expect(items[1].textContent?.trim()).toBe('Crema antipañalitis');

      // Individual
      const { fixture: indFixture } = await createPage(suggestions, mockIndividualInvitation);
      const indTitle = indFixture.nativeElement.querySelector('#basics-title');
      expect(indTitle?.textContent?.trim()).toBe(
        'Básicos que nunca sobran, tráelos si quieres',
      );
    });
  });

  describe('sobres', () => {
    it('con descripción de varias líneas muestra el texto recortado y 4 ilustraciones', async () => {
      const envelopeGift = buildEnvelopeGift({ description: 'Línea 1\nLínea 2' });
      const { fixture } = await createPage([envelopeGift], mockGroupInvitation);

      const envelopeCard = fixture.nativeElement.querySelector('.envelope-card');
      expect(envelopeCard).not.toBeNull();
      expect(envelopeCard.querySelector('.envelope-card__text')?.textContent?.trim()).toBe(
        'Línea 1\nLínea 2',
      );

      // Cuatro ilustraciones
      expect(envelopeCard.querySelector('.envelope-card__rain-1')).not.toBeNull();
      expect(envelopeCard.querySelector('.envelope-card__rain-2')).not.toBeNull();
      expect(envelopeCard.querySelector('.envelope-card__rain-3')).not.toBeNull();
      expect(envelopeCard.querySelector('.envelope-card__main')).not.toBeNull();
    });

    it('con null no muestra p.envelope-card__text', async () => {
      const envelopeGift = buildEnvelopeGift({ description: null });
      const { fixture } = await createPage([envelopeGift], mockGroupInvitation);

      expect(fixture.nativeElement.querySelector('.envelope-card')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.envelope-card__text')).toBeNull();
    });

    it('con texto vacío no muestra p.envelope-card__text', async () => {
      const envelopeGift = buildEnvelopeGift({ description: '' });
      const { fixture } = await createPage([envelopeGift], mockGroupInvitation);

      expect(fixture.nativeElement.querySelector('.envelope-card')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.envelope-card__text')).toBeNull();
    });

    it('con solo espacios y saltos de línea no muestra p.envelope-card__text', async () => {
      const envelopeGift = buildEnvelopeGift({ description: '  \n  ' });
      const { fixture } = await createPage([envelopeGift], mockGroupInvitation);

      expect(fixture.nativeElement.querySelector('.envelope-card')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.envelope-card__text')).toBeNull();
    });
  });

  describe('niveles de encabezado', () => {
    it('aria-level 3 en básicos y sobres con lista, y h2 en La lista de regalos', async () => {
      const list: GuestGift[] = [
        buildUniqueGift(),
        buildSuggestionGift(),
        buildEnvelopeGift(),
      ];
      const { fixture } = await createPage(list, mockGroupInvitation);

      const listTitle = fixture.nativeElement.querySelector('#list-title');
      expect(listTitle?.tagName.toLowerCase()).toBe('h2');
      expect(listTitle?.textContent?.trim()).toBe('La lista de regalos');

      const basicsTitle = fixture.nativeElement.querySelector('#basics-title');
      expect(basicsTitle?.getAttribute('aria-level')).toBe('3');

      const envelopeTitle = fixture.nativeElement.querySelector('#envelope-title');
      expect(envelopeTitle?.getAttribute('aria-level')).toBe('3');
    });

    it('aria-level 2 en básicos y sobres sin lista', async () => {
      const list: GuestGift[] = [
        buildSuggestionGift(),
        buildEnvelopeGift(),
      ];
      const { fixture } = await createPage(list, mockGroupInvitation);

      const basicsTitleNoList = fixture.nativeElement.querySelector('#basics-title');
      expect(basicsTitleNoList?.getAttribute('aria-level')).toBe('2');

      const envelopeTitleNoList = fixture.nativeElement.querySelector('#envelope-title');
      expect(envelopeTitleNoList?.getAttribute('aria-level')).toBe('2');
    });
  });

  describe('vacío total', () => {
    it('solo muestra el enlace back-link y el estado vacío, sin .gifts-header', async () => {
      const { fixture } = await createPage([], mockGroupInvitation);

      expect(fixture.nativeElement.querySelector('a.back-link')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('app-empty-state')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.gifts-header')).toBeNull();
      expect(fixture.nativeElement.querySelector('.closed-banner')).toBeNull();
    });
  });

  describe('confirmación tras reservar', () => {
    it('tiene role="status", aria-live="polite" y no tiene app-illustration dentro', async () => {
      const { fixture, component } = await createPage(mockGifts, mockGroupInvitation);
      mockGuestApi.reserveGift.mockResolvedValue(mockGifts);

      await component.executeReserve('gift-1');
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.reserved-confirmation-card');
      expect(card).not.toBeNull();
      expect(card.getAttribute('role')).toBe('status');
      expect(card.getAttribute('aria-live')).toBe('polite');
      expect(card.querySelector('app-illustration')).toBeNull();
      expect(card.querySelector('ion-icon[name="checkmark-circle"]')).not.toBeNull();
    });
  });

  describe('atajos de scroll y foco', () => {
    it('atajo de básicos llama a scrollToPoint con 300 ms y deja el foco en #basics-title', async () => {
      const { fixture, component } = await createPage(
        [buildUniqueGift(), buildSuggestionGift()],
        mockGroupInvitation,
      );

      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });

      const ionContent = component.content()!;
      const mockScrollEl = {
        scrollTop: 100,
        getBoundingClientRect: () => ({ top: 0, bottom: 800, left: 0, right: 400 }),
      };
      vi.spyOn(ionContent, 'getScrollElement').mockResolvedValue(mockScrollEl as unknown as HTMLElement);
      const scrollToPointSpy = vi.spyOn(ionContent, 'scrollToPoint').mockResolvedValue(undefined);

      component.scrollToBasics();

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(scrollToPointSpy).toHaveBeenCalledWith(0, expect.any(Number), 300);

      const basicsTitle = fixture.nativeElement.querySelector('#basics-title');
      expect(document.activeElement).toBe(basicsTitle);
    });

    it('con matchMedia prefers-reduced-motion reduce llama con 0 ms', async () => {
      const { component } = await createPage(
        [buildUniqueGift(), buildSuggestionGift()],
        mockGroupInvitation,
      );

      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });

      vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion: reduce'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } as unknown as MediaQueryList));

      const ionContent = component.content()!;
      const mockScrollEl = {
        scrollTop: 100,
        getBoundingClientRect: () => ({ top: 0, bottom: 800, left: 0, right: 400 }),
      };
      vi.spyOn(ionContent, 'getScrollElement').mockResolvedValue(mockScrollEl as unknown as HTMLElement);
      const scrollToPointSpy = vi.spyOn(ionContent, 'scrollToPoint').mockResolvedValue(undefined);

      component.scrollToBasics();

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(scrollToPointSpy).toHaveBeenCalledWith(0, expect.any(Number), 0);
    });

    it('atajo de sobres llama a scrollToPoint y enfoca #envelope-title', async () => {
      const { fixture, component } = await createPage(
        [buildUniqueGift(), buildEnvelopeGift()],
        mockGroupInvitation,
      );

      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });

      const ionContent = component.content()!;
      const mockScrollEl = {
        scrollTop: 100,
        getBoundingClientRect: () => ({ top: 0, bottom: 800, left: 0, right: 400 }),
      };
      vi.spyOn(ionContent, 'getScrollElement').mockResolvedValue(mockScrollEl as unknown as HTMLElement);
      const scrollToPointSpy = vi.spyOn(ionContent, 'scrollToPoint').mockResolvedValue(undefined);

      component.scrollToEnvelope();

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(scrollToPointSpy).toHaveBeenCalledWith(0, expect.any(Number), 300);

      const envelopeTitle = fixture.nativeElement.querySelector('#envelope-title');
      expect(document.activeElement).toBe(envelopeTitle);
    });
  });

  // Pruebas existentes de lógica de reserva / liberación / paginación
  it('renders "Su regalo" for group invitation with 1 gift', async () => {
    const { fixture } = await createPage(mockGifts, mockGroupInvitation);

    const headingEl = fixture.nativeElement.querySelector('#section-mine');
    expect(headingEl?.textContent?.trim()).toBe('Su regalo');

    const badgeEl = fixture.nativeElement.querySelector('.gift-card .badge-soft-success');
    expect(badgeEl?.textContent?.trim()).toBe('Su elección');
  });

  it('renders "Tu regalo" for individual invitation with 1 gift', async () => {
    const { fixture } = await createPage(mockGifts, mockIndividualInvitation);

    const headingEl = fixture.nativeElement.querySelector('#section-mine');
    expect(headingEl?.textContent?.trim()).toBe('Tu regalo');

    const badgeEl = fixture.nativeElement.querySelector('.gift-card .badge-soft-success');
    expect(badgeEl?.textContent?.trim()).toBe('Tu elección');
  });

  it('prompts confirmation with "Alguien más podrá elegirlo" when releasing', async () => {
    const { component } = await createPage(mockGifts, mockGroupInvitation);

    const alertCreateSpy = vi.spyOn(alertController, 'create').mockResolvedValue({
      present: vi.fn().mockResolvedValue(undefined),
    } as unknown as HTMLIonAlertElement);

    await component.onConfirmRelease(mockGifts[0]);

    expect(alertCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        header: 'Liberar regalo',
        message: '¿Liberar Coche para bebé? Alguien más podrá elegirlo.',
      }),
    );
  });

  it('prompts confirmation with reserveGiftConfirm when reserving', async () => {
    const unreservedGift = buildUniqueGift({ id: 'g-2', name: 'Silla para carro' });
    const { component } = await createPage([unreservedGift], mockIndividualInvitation);

    const alertCreateSpy = vi.spyOn(alertController, 'create').mockResolvedValue({
      present: vi.fn().mockResolvedValue(undefined),
    } as unknown as HTMLIonAlertElement);

    await component.onConfirmReserve(unreservedGift);

    expect(alertCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        header: 'Elegir regalo',
        message: '¿Quieres elegir Silla para carro? Nadie más sabrá que lo elegiste tú.',
      }),
    );
  });

  it('card agotada sin botón y con "Ya lo eligieron"; card elegida con "Tu elección" y "Liberar"; "Quedan 2 de 3" en un repetible', async () => {
    const soldOutGift = buildUniqueGift({
      id: 'gift-sold',
      name: 'Mochila pañalera',
      taken: true,
    });
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

    const { fixture, component } = await createPage(
      [soldOutGift, chosenGift, availableRepeatable],
      mockIndividualInvitation,
    );

    const chosenEl = fixture.nativeElement.querySelector('.gift-section--mine .gift-card');
    expect(chosenEl?.textContent).toContain('Tu elección');
    const releaseBtn = chosenEl?.querySelector('ion-button');
    expect(releaseBtn?.textContent).toContain('Liberar');

    const repEl = fixture.nativeElement.querySelector('.gift-card__remaining');
    expect(repEl?.textContent?.trim()).toBe('Quedan 2 de 3');

    component.onFilterChange(new CustomEvent('ionChange', { detail: { value: 'unique' } }));
    fixture.detectChanges();

    const soldCard = fixture.nativeElement.querySelector('.gift-card--sold-out');
    expect(soldCard).not.toBeNull();
    expect(soldCard?.textContent).toContain('Ya lo eligieron');
    expect(soldCard?.querySelector('ion-button')).toBeNull();
  });

  it('si reserveGift falla con gift_full, se muestra el mensaje y se recarga la lista', async () => {
    const giftRep: GuestGift = {
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
    };
    const { component } = await createPage([giftRep], mockGroupInvitation);
    mockGuestApi.reserveGift.mockRejectedValue(new GuestApiError('gift_full'));
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

  it('abre en Repetibles con los conteos correctos; al tocar Únicos cambia la lista y vuelve a la página 1', async () => {
    const list: GuestGift[] = [
      buildUniqueGift({ id: 'u-1', name: 'Coche' }),
      buildUniqueGift({ id: 'u-2', name: 'Cuna' }),
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

    const { fixture, component } = await createPage(list, mockIndividualInvitation);

    expect(component.preferredFilter()).toBe('repeatable');
    expect(component.activeCategory()).toBe('repeatable');
    expect(component.showFilter()).toBe(true);
    expect(component.counts()).toEqual({ unique: 2, repeatable: 1 });
    expect(component.visible().length).toBe(1);
    expect(component.visible()[0].id).toBe('r-1');

    component.onFilterChange(new CustomEvent('ionChange', { detail: { value: 'unique' } }));
    fixture.detectChanges();

    expect(component.preferredFilter()).toBe('unique');
    expect(component.activeCategory()).toBe('unique');
    expect(component.page()).toBe(1);
    expect(component.visible().length).toBe(2);
    expect(component.visible().map((g) => g.id)).toEqual(['u-1', 'u-2']);
  });

  it('los segmentos dicen exactamente "Únicos" y "Repetibles", sin paréntesis ni números', async () => {
    const list: GuestGift[] = [
      buildUniqueGift({ id: 'u-1', name: 'Coche' }),
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

    const { fixture } = await createPage(list, mockIndividualInvitation);

    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('ion-segment-button'),
    ) as HTMLElement[];
    const buttonTexts = buttons.map((b) => b.textContent?.trim());

    expect(buttonTexts).toEqual(['Únicos', 'Repetibles']);
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

    const { fixture, component } = await createPage(list, mockIndividualInvitation);

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

    const { fixture, component } = await createPage(list, mockIndividualInvitation);

    component.goToNextPage();
    fixture.detectChanges();

    expect(component.paged().page).toBe(2);
    expect(component.paged().items.map((g) => g.id)).toEqual(['rep-7']);

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

    const { fixture, component } = await createPage([g1, g2, g3], mockIndividualInvitation);

    const updated = [
      { ...g1, reserved_by_me: true },
      { ...g2, full: true, remaining: 0 },
      g3,
    ];
    mockGuestApi.reserveGift.mockResolvedValue(updated);

    await component.executeReserve('g-1');
    fixture.detectChanges();

    expect(component.visible().map((g) => g.id)).toEqual(['g-2', 'g-3']);
    expect(component.visible()[0].full).toBe(true);
  });

  it('sin envelope, no hay .envelope-card', async () => {
    const { fixture } = await createPage(mockGifts, mockIndividualInvitation);
    expect(fixture.nativeElement.querySelector('.envelope-card')).toBeNull();
  });

  it('no hay ningún botón dentro de la .envelope-card', async () => {
    const { fixture } = await createPage([buildEnvelopeGift()], mockGroupInvitation);

    const envelopeCard = fixture.nativeElement.querySelector('.envelope-card');
    expect(envelopeCard).not.toBeNull();
    expect(envelopeCard.querySelectorAll('ion-button').length).toBe(0);
    expect(envelopeCard.querySelectorAll('button').length).toBe(0);
  });
});
