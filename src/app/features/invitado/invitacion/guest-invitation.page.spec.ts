import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { ToastController } from '@ionic/angular';
import QRCode from 'qrcode';
import {
  GuestApiError,
  GuestApiService,
  GuestInvitation,
  formatInvitationCode,
  guestErrorMessage,
} from '../../../core';
import { GuestIntroComponent } from '../intro/guest-intro.component';
import {
  INTRO_ENVIRONMENT,
  IntroEnvironment,
} from '../intro/intro-environment';
import { GuestInvitationPage } from './guest-invitation.page';

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,fakeqr'),
  },
}));

const mockGroupInvitation: GuestInvitation = {
  invitation: {
    id: 'inv-group-1',
    group_name: 'Familia Ejemplo',
    code: 'ABCD1234JK',
    kind: 'group',
  },
  event: {
    name: 'Baby Shower Ejemplo',
    theme_id: 'baby-shower',
    starts_at: '2026-11-29T15:00:00-05:00',
    venue_name: 'Club Campestre',
    venue_address: 'Calle 10 # 5-20',
    city: 'Neiva',
    map_url: 'https://maps.google.com',
    welcome_message: 'Nos alegra celebrar juntos este momento.',
    rsvp_deadline: '2026-11-15T23:59:59-05:00',
  },
  guests: [
    { id: 'g-1', full_name: 'Ana Ejemplo', rsvp: 'pending' },
    { id: 'g-2', full_name: 'Luis Ejemplo', rsvp: 'pending' },
  ],
  can_respond: true,
  gifts_open: true,
};

const mockIndividualInvitation: GuestInvitation = {
  invitation: {
    id: 'inv-ind-1',
    group_name: 'Persona Ejemplo',
    code: 'WXYZ5678LM',
    kind: 'individual',
  },
  event: {
    name: 'Baby Shower Ejemplo',
    theme_id: 'baby-shower',
    starts_at: '2026-11-29T15:00:00-05:00',
    venue_name: 'Club Campestre',
    venue_address: 'Calle 10 # 5-20',
    city: 'Neiva',
    map_url: 'https://maps.google.com',
    welcome_message: 'Nos alegra celebrar juntos este momento.',
    rsvp_deadline: '2026-11-15T23:59:59-05:00',
  },
  guests: [
    { id: 'g-1', full_name: 'Persona Ejemplo', rsvp: 'pending' },
  ],
  can_respond: true,
  gifts_open: true,
};

const mockHoneyBeeInvitation: GuestInvitation = {
  ...mockGroupInvitation,
  event: {
    ...mockGroupInvitation.event,
    theme_id: 'honey-bee',
  },
};

function fakeEnv(
  overrides: Partial<IntroEnvironment> = {},
): IntroEnvironment & { markSeen: ReturnType<typeof vi.fn> } {
  return {
    isNativePlatform: () => false,
    prefersReducedMotion: () => false,
    prefersLessData: () => false,
    isPortrait: () => true,
    hasSeen: () => false,
    markSeen: vi.fn(),
    ...overrides,
  } as never;
}

describe('GuestInvitationPage', () => {
  let fixture: ComponentFixture<GuestInvitationPage>;
  let component: GuestInvitationPage;
  let mockGuestApi: {
    getInvitation: ReturnType<typeof vi.fn>;
    setRsvp: ReturnType<typeof vi.fn>;
  };
  let mockToast: {
    present: ReturnType<typeof vi.fn>;
  };
  let mockToastController: {
    create: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);

    mockGuestApi = {
      getInvitation: vi.fn(),
      setRsvp: vi.fn(),
    };

    mockToast = {
      present: vi.fn().mockResolvedValue(undefined),
    };
    mockToastController = {
      create: vi.fn().mockResolvedValue(mockToast),
    };

    await TestBed.configureTestingModule({
      imports: [GuestInvitationPage],
      providers: [
        provideRouter([]),
        { provide: GuestApiService, useValue: mockGuestApi },
        { provide: ToastController, useValue: mockToastController },
        { provide: INTRO_ENVIRONMENT, useValue: fakeEnv({ hasSeen: () => true }) },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('renders group invitation with plural texts and entry code card', async () => {
    mockGuestApi.getInvitation.mockResolvedValue(mockGroupInvitation);
    vi.mocked(QRCode.toDataURL).mockResolvedValue('data:image/png;base64,fakeqr' as never);

    fixture = TestBed.createComponent(GuestInvitationPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'ABCD1234JK');

    await component.loadInvitation();
    fixture.detectChanges();

    // Título de bienvenida
    const titleEl = fixture.nativeElement.querySelector('.welcome-card__title');
    expect(titleEl?.textContent?.trim()).toBe('La familia Ejemplo está invitada');

    // Plazo en plural
    const deadlineEl = fixture.nativeElement.querySelector('.deadline-banner span');
    expect(deadlineEl?.textContent?.trim()).toContain('Por favor respondan antes del');

    // Mesa oculta
    expect(fixture.nativeElement.querySelector('.table-card')).toBeNull();

    // Card de regalos
    const giftsTitleEl = fixture.nativeElement.querySelector('.gifts-card__title');
    expect(giftsTitleEl?.textContent?.trim()).toBe('Un detalle para Eloise');

    const giftsImg = fixture.nativeElement.querySelector(
      '.gifts-card__cover-image',
    ) as HTMLImageElement;
    expect(giftsImg).not.toBeNull();
    expect(giftsImg.getAttribute('alt')).toBe('');
    expect(giftsImg.src.endsWith('gift-reserved.webp')).toBe(true);

    // Tarjeta de código de entrada
    const entryCard = fixture.nativeElement.querySelector('.entry-code-card');
    expect(entryCard).not.toBeNull();

    const entryTitle = entryCard.querySelector('.entry-code-card__title');
    expect(entryTitle?.textContent?.trim()).toBe('Código de entrada');
    expect(entryTitle?.classList.contains('text-section')).toBe(true);

    const qrImg = entryCard.querySelector('.entry-code-card__qr-image') as HTMLImageElement;
    expect(qrImg).not.toBeNull();
    expect(qrImg?.src).toBe('data:image/png;base64,fakeqr');
    expect(qrImg?.alt).toBe('Código QR de la invitación');

    const codeEl = entryCard.querySelector('.entry-code-card__code');
    expect(codeEl?.textContent?.trim()).toBe(formatInvitationCode('ABCD1234JK'));
    expect(codeEl?.hasAttribute('aria-label')).toBe(false);
    expect(fixture.nativeElement.querySelector('.gifts-card__closed')).toBeNull();

    const instructionEl = entryCard.querySelector('.entry-code-card__instruction');
    expect(instructionEl?.textContent?.trim()).toBe(
      'Muestren este código en la entrada. Sirve para todo el grupo.',
    );

    const tipEl = entryCard.querySelector('.entry-code-card__tip');
    expect(tipEl?.textContent?.trim()).toBe(
      'Tómenle una captura de pantalla para tenerlo a mano, aunque no haya señal.',
    );
  });

  it('renders individual invitation with singular texts', async () => {
    mockGuestApi.getInvitation.mockResolvedValue(mockIndividualInvitation);
    vi.mocked(QRCode.toDataURL).mockResolvedValue('data:image/png;base64,fakeqr' as never);

    fixture = TestBed.createComponent(GuestInvitationPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'WXYZ5678LM');

    await component.loadInvitation();
    fixture.detectChanges();

    // Título de bienvenida en singular
    const titleEl = fixture.nativeElement.querySelector('.welcome-card__title');
    expect(titleEl?.textContent?.trim()).toBe('Persona Ejemplo, te invitamos');

    // Plazo en singular
    const deadlineEl = fixture.nativeElement.querySelector('.deadline-banner span');
    expect(deadlineEl?.textContent?.trim()).toContain('Por favor responde antes del');

    // Mesa oculta
    expect(fixture.nativeElement.querySelector('.table-card')).toBeNull();
  });

  it('renders entry code card without QR image if generation fails', async () => {
    mockGuestApi.getInvitation.mockResolvedValue(mockGroupInvitation);
    vi.mocked(QRCode.toDataURL).mockRejectedValue(new Error('Canvas unavailable'));

    fixture = TestBed.createComponent(GuestInvitationPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'ABCD1234JK');

    await component.loadInvitation();
    fixture.detectChanges();

    const entryCard = fixture.nativeElement.querySelector('.entry-code-card');
    expect(entryCard).not.toBeNull();

    // Sin imagen
    const qrImg = entryCard.querySelector('.entry-code-card__qr-image');
    expect(qrImg).toBeNull();

    // Pero el código en texto se mantiene
    const codeEl = entryCard.querySelector('.entry-code-card__code');
    expect(codeEl?.textContent?.trim()).toBe(formatInvitationCode('ABCD1234JK'));
    expect(codeEl?.hasAttribute('aria-label')).toBe(false);
    expect(fixture.nativeElement.querySelector('.gifts-card__closed')).toBeNull();
  });

  it('adapts closed deadline message to kind', async () => {
    const closedIndividual = {
      ...mockIndividualInvitation,
      can_respond: false,
    };
    mockGuestApi.getInvitation.mockResolvedValue(closedIndividual);

    fixture = TestBed.createComponent(GuestInvitationPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'WXYZ5678LM');

    await component.loadInvitation();
    fixture.detectChanges();

    const closedBanner = fixture.nativeElement.querySelector('.deadline-banner--closed span');
    expect(closedBanner?.textContent?.trim()).toBe(
      'El plazo para responder ya terminó. Si necesitas cambiar tu respuesta, escríbenos al WhatsApp donde te llegó la invitación.',
    );
  });

  it('adapts rsvp thanks message to kind', async () => {
    const answeredGroup = {
      ...mockGroupInvitation,
      guests: [
        { id: 'g-1', full_name: 'Ana Ejemplo', rsvp: 'accepted' as const },
        { id: 'g-2', full_name: 'Luis Ejemplo', rsvp: 'accepted' as const },
      ],
    };
    mockGuestApi.getInvitation.mockResolvedValue(answeredGroup);

    fixture = TestBed.createComponent(GuestInvitationPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'ABCD1234JK');

    await component.loadInvitation();
    fixture.detectChanges();

    const thanksEl = fixture.nativeElement.querySelector('.confirmation-card__text');
    expect(thanksEl?.textContent?.trim()).toContain(
      '¡Gracias! Recibimos su respuesta. Pueden cambiarla hasta el',
    );
  });

  it('renders gifts intro in plural before the gift list button for group invitations', async () => {
    mockGuestApi.getInvitation.mockResolvedValue(mockGroupInvitation);
    vi.mocked(QRCode.toDataURL).mockResolvedValue('data:image/png;base64,fakeqr' as never);

    fixture = TestBed.createComponent(GuestInvitationPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'ABCD1234JK');

    await component.loadInvitation();
    fixture.detectChanges();

    const introParagraphs = fixture.nativeElement.querySelectorAll('.gifts-intro__text');
    expect(introParagraphs.length).toBe(1);
    expect(introParagraphs[0]?.textContent?.trim()).toBe(
      'Su compañía es el mejor regalo, así que no sientan ningún compromiso. Si les hace ilusión llevar algo, preparamos una lista con algunas ideas.',
    );

    const giftsIntroEl = fixture.nativeElement.querySelector('.gifts-intro');
    expect(giftsIntroEl).not.toBeNull();
    const giftListButton = giftsIntroEl.nextElementSibling as HTMLElement | null;
    expect(giftListButton).not.toBeNull();
    expect(giftListButton?.tagName.toLowerCase()).toBe('ion-button');
    expect(giftListButton?.textContent?.trim()).toContain('Ver lista de regalos');
  });

  it('renders gifts intro in singular for individual invitations', async () => {
    mockGuestApi.getInvitation.mockResolvedValue(mockIndividualInvitation);
    vi.mocked(QRCode.toDataURL).mockResolvedValue('data:image/png;base64,fakeqr' as never);

    fixture = TestBed.createComponent(GuestInvitationPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('code', 'WXYZ5678LM');

    await component.loadInvitation();
    fixture.detectChanges();

    const introParagraphs = fixture.nativeElement.querySelectorAll('.gifts-intro__text');
    expect(introParagraphs.length).toBe(1);
    expect(introParagraphs[0]?.textContent?.trim()).toBe(
      'Tu compañía es el mejor regalo, así que no sientas ningún compromiso. Si te hace ilusión llevar algo, preparamos una lista con algunas ideas.',
    );
  });

  describe('card de confirmación (punto 1 y 2)', () => {
    it('1.1 grupo sin respuestas: no muestra confirmation-card', async () => {
      mockGuestApi.getInvitation.mockResolvedValue(mockGroupInvitation);
      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'ABCD1234JK');

      await component.loadInvitation();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.confirmation-card')).toBeNull();
    });

    it('1.2 grupo con una persona pendiente: muestra missing sin ilustración y menciona a Ana Ejemplo', async () => {
      const invWithOnePending: GuestInvitation = {
        ...mockGroupInvitation,
        guests: [
          { id: 'g-1', full_name: 'Ana Ejemplo', rsvp: 'pending' },
          { id: 'g-2', full_name: 'Luis Ejemplo', rsvp: 'accepted' },
        ],
      };
      mockGuestApi.getInvitation.mockResolvedValue(invWithOnePending);
      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'ABCD1234JK');

      await component.loadInvitation();
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.confirmation-card');
      expect(card).not.toBeNull();
      expect(card.classList.contains('confirmation-card--missing')).toBe(true);
      expect(card.querySelector('app-illustration')).toBeNull();
      const text = card.querySelector('.confirmation-card__text')?.textContent?.trim();
      expect(text).toContain('Falta que responda: Ana Ejemplo.');
    });

    it('1.3 grupo con dos personas pendientes: muestra missing sin ilustración y menciona a Ana Ejemplo y Luis Ejemplo', async () => {
      const invWithTwoPending: GuestInvitation = {
        ...mockGroupInvitation,
        guests: [
          { id: 'g-0', full_name: 'Persona Ejemplo', rsvp: 'accepted' },
          { id: 'g-1', full_name: 'Ana Ejemplo', rsvp: 'pending' },
          { id: 'g-2', full_name: 'Luis Ejemplo', rsvp: 'pending' },
        ],
      };
      mockGuestApi.getInvitation.mockResolvedValue(invWithTwoPending);
      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'ABCD1234JK');

      await component.loadInvitation();
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.confirmation-card');
      expect(card).not.toBeNull();
      expect(card.classList.contains('confirmation-card--missing')).toBe(true);
      expect(card.querySelector('app-illustration')).toBeNull();
      const text = card.querySelector('.confirmation-card__text')?.textContent?.trim();
      expect(text).toContain('Falta que respondan: Ana Ejemplo y Luis Ejemplo.');
    });

    it('1.4 grupo completo: muestra thanks con ilustración', async () => {
      const fullGroup: GuestInvitation = {
        ...mockGroupInvitation,
        guests: [
          { id: 'g-1', full_name: 'Ana Ejemplo', rsvp: 'accepted' },
          { id: 'g-2', full_name: 'Luis Ejemplo', rsvp: 'declined' },
        ],
      };
      mockGuestApi.getInvitation.mockResolvedValue(fullGroup);
      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'ABCD1234JK');

      await component.loadInvitation();
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.confirmation-card');
      expect(card).not.toBeNull();
      expect(card.classList.contains('confirmation-card--missing')).toBe(false);
      expect(card.querySelector('app-illustration')).not.toBeNull();
      const text = card.querySelector('.confirmation-card__text')?.textContent?.trim();
      expect(text).toContain('¡Gracias! Recibimos su respuesta. Pueden cambiarla hasta el');
    });

    it('1.5 plazo cerrado con respuestas: muestra closed con ilustración', async () => {
      const closedWithAnswers: GuestInvitation = {
        ...mockGroupInvitation,
        can_respond: false,
        guests: [
          { id: 'g-1', full_name: 'Ana Ejemplo', rsvp: 'accepted' },
          { id: 'g-2', full_name: 'Luis Ejemplo', rsvp: 'pending' },
        ],
      };
      mockGuestApi.getInvitation.mockResolvedValue(closedWithAnswers);
      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'ABCD1234JK');

      await component.loadInvitation();
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.confirmation-card');
      expect(card).not.toBeNull();
      expect(card.classList.contains('confirmation-card--missing')).toBe(false);
      expect(card.querySelector('app-illustration')).not.toBeNull();
      expect(card.querySelector('.confirmation-card__text')?.textContent?.trim()).toBe(
        '¡Gracias! Recibimos su respuesta.',
      );
    });

    it('1.6 plazo cerrado sin respuestas: no muestra confirmation-card', async () => {
      const closedNoAnswers: GuestInvitation = {
        ...mockGroupInvitation,
        can_respond: false,
        guests: [
          { id: 'g-1', full_name: 'Ana Ejemplo', rsvp: 'pending' },
          { id: 'g-2', full_name: 'Luis Ejemplo', rsvp: 'pending' },
        ],
      };
      mockGuestApi.getInvitation.mockResolvedValue(closedNoAnswers);
      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'ABCD1234JK');

      await component.loadInvitation();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.confirmation-card')).toBeNull();
    });

    it('1.7 individual respondida: muestra thanks con texto en singular e ilustración', async () => {
      const indAnswered: GuestInvitation = {
        ...mockIndividualInvitation,
        guests: [
          { id: 'g-1', full_name: 'Persona Ejemplo', rsvp: 'accepted' },
        ],
      };
      mockGuestApi.getInvitation.mockResolvedValue(indAnswered);
      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'WXYZ5678LM');

      await component.loadInvitation();
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.confirmation-card');
      expect(card).not.toBeNull();
      expect(card.classList.contains('confirmation-card--missing')).toBe(false);
      expect(card.querySelector('app-illustration')).not.toBeNull();
      const text = card.querySelector('.confirmation-card__text')?.textContent?.trim();
      expect(text).toContain('¡Gracias! Recibimos tu respuesta. Puedes cambiarla hasta el');
    });

    it('1.8 individual cerrada respondida: muestra closed con texto en singular e ilustración', async () => {
      const indClosedAnswered: GuestInvitation = {
        ...mockIndividualInvitation,
        can_respond: false,
        guests: [
          { id: 'g-1', full_name: 'Persona Ejemplo', rsvp: 'accepted' },
        ],
      };
      mockGuestApi.getInvitation.mockResolvedValue(indClosedAnswered);
      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'WXYZ5678LM');

      await component.loadInvitation();
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.confirmation-card');
      expect(card).not.toBeNull();
      expect(card.classList.contains('confirmation-card--missing')).toBe(false);
      expect(card.querySelector('app-illustration')).not.toBeNull();
      expect(card.querySelector('.confirmation-card__text')?.textContent?.trim()).toBe(
        '¡Gracias! Recibimos tu respuesta.',
      );
    });

    it('2. al responder la última persona pendiente de un grupo, la card pasa de missing a thanks', async () => {
      const initialInv: GuestInvitation = {
        ...mockGroupInvitation,
        guests: [
          { id: 'g-1', full_name: 'Ana Ejemplo', rsvp: 'accepted' },
          { id: 'g-2', full_name: 'Luis Ejemplo', rsvp: 'pending' },
        ],
      };
      mockGuestApi.getInvitation.mockResolvedValue(initialInv);
      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'ABCD1234JK');

      await component.loadInvitation();
      fixture.detectChanges();

      let card = fixture.nativeElement.querySelector('.confirmation-card');
      expect(card.classList.contains('confirmation-card--missing')).toBe(true);
      expect(card.querySelector('app-illustration')).toBeNull();

      const updatedInv: GuestInvitation = {
        ...initialInv,
        guests: [
          { id: 'g-1', full_name: 'Ana Ejemplo', rsvp: 'accepted' },
          { id: 'g-2', full_name: 'Luis Ejemplo', rsvp: 'accepted' },
        ],
      };
      mockGuestApi.setRsvp.mockResolvedValue(updatedInv);

      await component.onSelectRsvp(initialInv.guests[1], 'accepted');
      fixture.detectChanges();

      card = fixture.nativeElement.querySelector('.confirmation-card');
      expect(card.classList.contains('confirmation-card--missing')).toBe(false);
      expect(card.querySelector('app-illustration')).not.toBeNull();
      expect(card.querySelector('.confirmation-card__text')?.textContent).toContain(
        '¡Gracias! Recibimos su respuesta. Pueden cambiarla hasta el',
      );
    });
  });

  describe('plazo cerrado: respuesta como dato (punto 3)', () => {
    it('3. no muestra botones rsvp y muestra insignias de respuesta para cada persona', async () => {
      const closedInv: GuestInvitation = {
        ...mockGroupInvitation,
        can_respond: false,
        guests: [
          { id: 'g-1', full_name: 'Ana Ejemplo', rsvp: 'accepted' },
          { id: 'g-2', full_name: 'Luis Ejemplo', rsvp: 'declined' },
          { id: 'g-3', full_name: 'Persona Ejemplo', rsvp: 'pending' },
        ],
      };
      mockGuestApi.getInvitation.mockResolvedValue(closedInv);
      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'ABCD1234JK');

      await component.loadInvitation();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelectorAll('.rsvp-button').length).toBe(0);

      const answers = fixture.nativeElement.querySelectorAll('.guest-card__answer');
      expect(answers.length).toBe(3);

      expect(answers[0].textContent.trim()).toBe('Asistirá');
      expect(answers[0].classList.contains('badge-soft-success')).toBe(true);

      expect(answers[1].textContent.trim()).toBe('No asistirá');
      expect(answers[1].classList.contains('badge-soft-medium')).toBe(true);

      expect(answers[2].textContent.trim()).toBe('Sin respuesta');
      expect(answers[2].classList.contains('badge-soft-warning')).toBe(true);
    });
  });

  describe('asociación de accesibilidad (punto 4)', () => {
    it('4. asocia acciones con aria-labelledby apuntando al id del nombre', async () => {
      mockGuestApi.getInvitation.mockResolvedValue(mockGroupInvitation);
      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'ABCD1234JK');

      await component.loadInvitation();
      fixture.detectChanges();

      const cards = fixture.nativeElement.querySelectorAll('.guest-card');
      expect(cards.length).toBe(2);

      mockGroupInvitation.guests.forEach((guest, index) => {
        const card = cards[index];
        const nameEl = card.querySelector('.guest-card__name');
        const actionsEl = card.querySelector('.guest-card__actions');

        expect(nameEl?.id).toBe(`guest-name-${guest.id}`);
        expect(actionsEl?.getAttribute('role')).toBe('group');
        expect(actionsEl?.getAttribute('aria-labelledby')).toBe(`guest-name-${guest.id}`);
      });
    });
  });

  describe('errores al guardar dentro de la card (puntos 5 y 6)', () => {
    it('5.1 muestra error inline role="alert" en grupo al fallar setRsvp con network_error y no crea toast', async () => {
      mockGuestApi.getInvitation.mockResolvedValue(mockGroupInvitation);
      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'ABCD1234JK');

      await component.loadInvitation();
      fixture.detectChanges();

      mockGuestApi.setRsvp.mockRejectedValueOnce(new GuestApiError('network_error'));
      await component.onSelectRsvp(mockGroupInvitation.guests[0], 'accepted');
      fixture.detectChanges();

      const errorEl = fixture.nativeElement.querySelector('.guest-card .guest-card__error');
      expect(errorEl).not.toBeNull();
      expect(errorEl?.getAttribute('role')).toBe('alert');
      expect(errorEl?.textContent?.trim()).toBe(
        'No pudimos conectarnos. Revisen su conexión e inténtenlo de nuevo.',
      );
      expect(mockToastController.create).not.toHaveBeenCalled();

      // Al reintentar con éxito, el error desaparece
      const updatedInv = {
        ...mockGroupInvitation,
        guests: [
          { ...mockGroupInvitation.guests[0], rsvp: 'accepted' as const },
          mockGroupInvitation.guests[1],
        ],
      };
      mockGuestApi.setRsvp.mockResolvedValueOnce(updatedInv);
      await component.onSelectRsvp(mockGroupInvitation.guests[0], 'accepted');
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.guest-card__error')).toBeNull();
    });

    it('5.2 muestra error inline con variante individual en invitación individual', async () => {
      mockGuestApi.getInvitation.mockResolvedValue(mockIndividualInvitation);
      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'WXYZ5678LM');

      fixture.detectChanges();
      await component.loadInvitation();
      fixture.detectChanges();

      mockGuestApi.setRsvp.mockRejectedValueOnce(new GuestApiError('network_error'));
      await component.onSelectRsvp(mockIndividualInvitation.guests[0], 'accepted');
      fixture.detectChanges();

      const errorEl = fixture.nativeElement.querySelector('.guest-card .guest-card__error');
      expect(errorEl?.textContent?.trim()).toBe(
        guestErrorMessage('network_error', 'individual'),
      );
    });

    it('5.3 muestra mensaje por defecto en error que no es GuestApiError', async () => {
      mockGuestApi.getInvitation.mockResolvedValue(mockGroupInvitation);
      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'ABCD1234JK');

      fixture.detectChanges();
      await component.loadInvitation();
      fixture.detectChanges();

      mockGuestApi.setRsvp.mockRejectedValueOnce(new Error('Unknown crash'));
      await component.onSelectRsvp(mockGroupInvitation.guests[0], 'accepted');
      fixture.detectChanges();

      const errorEl = fixture.nativeElement.querySelector('.guest-card .guest-card__error');
      expect(errorEl?.textContent?.trim()).toBe(
        'No pudimos guardar el cambio. Inténtenlo de nuevo.',
      );
    });

    it('6. con deadline_passed pone can_respond en falso, no muestra error en card y muestra banda de plazo cerrado', async () => {
      mockGuestApi.getInvitation.mockResolvedValue(mockGroupInvitation);
      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'ABCD1234JK');

      fixture.detectChanges();
      await component.loadInvitation();
      fixture.detectChanges();

      mockGuestApi.setRsvp.mockRejectedValueOnce(new GuestApiError('deadline_passed'));
      await component.onSelectRsvp(mockGroupInvitation.guests[0], 'accepted');
      fixture.detectChanges();

      expect(component.invitation()?.can_respond).toBe(false);
      expect(fixture.nativeElement.querySelector('.guest-card__error')).toBeNull();

      const closedBanner = fixture.nativeElement.querySelector('.deadline-banner--closed span');
      expect(closedBanner?.textContent?.trim()).toBe(
        'El plazo para responder ya terminó. Si necesitan cambiar su respuesta, escríbannos al WhatsApp donde les llegó la invitación.',
      );
    });
  });

  describe('mensajes de carga y recarga (puntos 7 y 8)', () => {
    it('muestra el texto de carga y spinner sin aria-label mientras se carga la invitación', () => {
      mockGuestApi.getInvitation.mockReturnValue(new Promise(() => {}));
      fixture = TestBed.createComponent(GuestInvitationPage);
      fixture.componentRef.setInput('code', 'ABCD1234JK');

      fixture.detectChanges();

      const loadingContainer = fixture.nativeElement.querySelector('.loading-state');
      expect(loadingContainer).not.toBeNull();
      expect(loadingContainer.getAttribute('role')).toBe('status');
      expect(loadingContainer.getAttribute('aria-live')).toBe('polite');

      const textEl = loadingContainer.querySelector('.loading-state__text');
      expect(textEl?.textContent?.trim()).toBe('Cargando la invitación…');

      const spinner = loadingContainer.querySelector('ion-spinner');
      expect(spinner).not.toBeNull();
      expect(spinner.getAttribute('color')).toBe('medium');
      expect(spinner.getAttribute('aria-hidden')).toBe('true');
      expect(spinner.hasAttribute('aria-label')).toBe(false);
    });

    it('7.1 RPC devuelve null: mensaje invalid_code sin botón Reintentar', async () => {
      mockGuestApi.getInvitation.mockResolvedValue(null);
      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'INVALID123');

      fixture.detectChanges();
      await component.loadInvitation();
      fixture.detectChanges();

      const errorEl = fixture.nativeElement.querySelector('.load-error');
      expect(errorEl).not.toBeNull();
      const titleEl = errorEl.querySelector('h1.load-error__title');
      expect(titleEl?.textContent?.trim()).toBe('No encontramos esta invitación');
      expect(errorEl.querySelector('.load-error__message')?.textContent?.trim()).toBe(
        'Revisa que el enlace esté completo.',
      );
      expect(component.canRetry()).toBe(false);
      expect(fixture.nativeElement.querySelector('.load-error ion-button')).toBeNull();
    });

    it('7.2 error de red en carga inicial: mensaje individual con botón Reintentar', async () => {
      mockGuestApi.getInvitation.mockRejectedValue(new GuestApiError('network_error'));
      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'NETERR1234');

      fixture.detectChanges();
      await component.loadInvitation();
      fixture.detectChanges();

      const errorEl = fixture.nativeElement.querySelector('.load-error');
      expect(errorEl).not.toBeNull();
      const titleEl = errorEl.querySelector('h1.load-error__title');
      expect(titleEl?.textContent?.trim()).toBe('No pudimos cargar la invitación');
      expect(errorEl?.textContent).toContain(guestErrorMessage('network_error', 'individual'));
      expect(component.canRetry()).toBe(true);
      const retryBtn = fixture.nativeElement.querySelector(
        '.load-error ion-button',
      ) as HTMLButtonElement | null;
      expect(retryBtn).not.toBeNull();
      const retrySpy = vi.spyOn(component, 'retryLoad');
      retryBtn?.click();
      expect(retrySpy).toHaveBeenCalled();
    });

    it('7.3 código inesperado en carga inicial: mensaje load_failed con botón Reintentar', async () => {
      mockGuestApi.getInvitation.mockRejectedValue(new GuestApiError('invalid_value'));
      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'ERR1234567');

      fixture.detectChanges();
      await component.loadInvitation();
      fixture.detectChanges();

      const errorEl = fixture.nativeElement.querySelector('.load-error');
      expect(errorEl).not.toBeNull();
      const titleEl = errorEl.querySelector('h1.load-error__title');
      expect(titleEl?.textContent?.trim()).toBe('No pudimos cargar la invitación');
      expect(errorEl.querySelector('.load-error__message')?.textContent?.trim()).toBe('Toca "Reintentar".');
      expect(component.canRetry()).toBe(true);
      expect(fixture.nativeElement.querySelector('.load-error ion-button')).not.toBeNull();
    });

    it('muestra aviso de lista cerrada con gifts_open false y lo oculta con true', async () => {
      // Con gifts_open: true
      mockGuestApi.getInvitation.mockResolvedValue(mockGroupInvitation);
      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'ABCD1234JK');
      fixture.detectChanges();
      await component.loadInvitation();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.gifts-card__closed')).toBeNull();

      // Con gifts_open: false
      const closedGifts = {
        ...mockGroupInvitation,
        gifts_open: false,
      };
      mockGuestApi.getInvitation.mockResolvedValue(closedGifts);
      const fixtureClosed = TestBed.createComponent(GuestInvitationPage);
      const compClosed = fixtureClosed.componentInstance;
      fixtureClosed.componentRef.setInput('code', 'CLOSED123');
      fixtureClosed.detectChanges();
      await compClosed.loadInvitation();
      fixtureClosed.detectChanges();

      const closedEl = fixtureClosed.nativeElement.querySelector('.gifts-card__closed');
      expect(closedEl).not.toBeNull();
      expect(closedEl?.textContent?.trim()).toContain('La lista de regalos ya cerró.');
      const lockIcon = closedEl.querySelector('ion-icon[name="lock-closed-outline"]');
      expect(lockIcon).not.toBeNull();
      expect(lockIcon.getAttribute('aria-hidden')).toBe('true');
    });

    it('8. recarga fallida con invitación cargada: muestra toast de 8000 ms con Reintentar y Cerrar', async () => {
      mockGuestApi.getInvitation.mockResolvedValue(mockGroupInvitation);
      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'ABCD1234JK');

      fixture.detectChanges();
      await component.loadInvitation();
      fixture.detectChanges();

      mockGuestApi.getInvitation.mockRejectedValue(new GuestApiError('network_error'));
      await component.loadInvitation(true);

      expect(mockToastController.create).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'No pudimos conectarnos. Revisen su conexión e inténtenlo de nuevo.',
          duration: 8000,
          color: 'danger',
          position: 'bottom',
          buttons: expect.arrayContaining([
            expect.objectContaining({ text: 'Reintentar', handler: expect.any(Function) }),
            expect.objectContaining({ text: 'Cerrar', role: 'cancel' }),
          ]),
        }),
      );
      expect(mockToast.present).toHaveBeenCalled();

      const toastArgs = mockToastController.create.mock.calls[0][0];
      const retryBtn = toastArgs.buttons.find((btn: { text: string }) => btn.text === 'Reintentar');
      const loadSpy = vi.spyOn(component, 'loadInvitation');
      retryBtn.handler();
      expect(loadSpy).toHaveBeenCalledWith(false);
    });
  });

  describe('video de bienvenida (intro layer)', () => {
    it('1. shows app-guest-intro and adds inert to ion-content for honey-bee theme when offered', async () => {
      TestBed.overrideProvider(INTRO_ENVIRONMENT, {
        useValue: fakeEnv({ hasSeen: () => false }),
      });
      mockGuestApi.getInvitation.mockResolvedValue(mockHoneyBeeInvitation);

      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'ABCD1234JK');

      fixture.detectChanges();
      await component.loadInvitation();
      fixture.detectChanges();

      const introEl = fixture.nativeElement.querySelector('app-guest-intro');
      expect(introEl).not.toBeNull();

      const contentEl = fixture.nativeElement.querySelector('ion-content');
      expect(contentEl.hasAttribute('inert')).toBe(true);
    });

    it('2. does not show app-guest-intro or video, and ion-content is not inert for baby-shower theme', async () => {
      TestBed.overrideProvider(INTRO_ENVIRONMENT, {
        useValue: fakeEnv({ hasSeen: () => false }),
      });
      mockGuestApi.getInvitation.mockResolvedValue(mockGroupInvitation);

      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'ABCD1234JK');

      fixture.detectChanges();
      await component.loadInvitation();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-guest-intro')).toBeNull();
      expect(fixture.nativeElement.querySelector('video')).toBeNull();

      const contentEl = fixture.nativeElement.querySelector('ion-content');
      expect(contentEl.hasAttribute('inert')).toBe(false);
    });

    it('3. does not show app-guest-intro or video on native platform with honey-bee', async () => {
      TestBed.overrideProvider(INTRO_ENVIRONMENT, {
        useValue: fakeEnv({ isNativePlatform: () => true }),
      });
      mockGuestApi.getInvitation.mockResolvedValue(mockHoneyBeeInvitation);

      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'ABCD1234JK');

      fixture.detectChanges();
      await component.loadInvitation();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-guest-intro')).toBeNull();
      expect(fixture.nativeElement.querySelector('video')).toBeNull();
    });

    it('4. does not show app-guest-intro or video when prefers-reduced-motion is true', async () => {
      TestBed.overrideProvider(INTRO_ENVIRONMENT, {
        useValue: fakeEnv({ prefersReducedMotion: () => true }),
      });
      mockGuestApi.getInvitation.mockResolvedValue(mockHoneyBeeInvitation);

      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'ABCD1234JK');

      fixture.detectChanges();
      await component.loadInvitation();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-guest-intro')).toBeNull();
      expect(fixture.nativeElement.querySelector('video')).toBeNull();
    });

    it('5. does not show app-guest-intro or video on second visit (hasSeen is true)', async () => {
      TestBed.overrideProvider(INTRO_ENVIRONMENT, {
        useValue: fakeEnv({ hasSeen: () => true }),
      });
      mockGuestApi.getInvitation.mockResolvedValue(mockHoneyBeeInvitation);

      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'ABCD1234JK');

      fixture.detectChanges();
      await component.loadInvitation();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-guest-intro')).toBeNull();
      expect(fixture.nativeElement.querySelector('video')).toBeNull();
    });

    it('6. does not show app-guest-intro while invitation is loading', () => {
      TestBed.overrideProvider(INTRO_ENVIRONMENT, {
        useValue: fakeEnv({ hasSeen: () => false }),
      });
      mockGuestApi.getInvitation.mockReturnValue(new Promise(() => {}));

      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'ABCD1234JK');

      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-guest-intro')).toBeNull();
    });

    it('7. removes app-guest-intro and removes inert attribute when finished is emitted', async () => {
      TestBed.overrideProvider(INTRO_ENVIRONMENT, {
        useValue: fakeEnv({ hasSeen: () => false }),
      });
      mockGuestApi.getInvitation.mockResolvedValue(mockHoneyBeeInvitation);

      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'ABCD1234JK');

      fixture.detectChanges();
      await component.loadInvitation();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-guest-intro')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('ion-content').hasAttribute('inert')).toBe(true);

      component.onIntroFinished();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-guest-intro')).toBeNull();
      expect(fixture.nativeElement.querySelector('ion-content').hasAttribute('inert')).toBe(false);
    });

    it('8. manages intro-pending and intro-reveal classes through exitStarted and finished transitions', async () => {
      TestBed.overrideProvider(INTRO_ENVIRONMENT, {
        useValue: fakeEnv({ hasSeen: () => false }),
      });
      mockGuestApi.getInvitation.mockResolvedValue(mockHoneyBeeInvitation);

      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'ABCD1234JK');

      fixture.detectChanges();
      await component.loadInvitation();
      fixture.detectChanges();

      const container = fixture.nativeElement.querySelector('.guest-accessibility-view');
      expect(container.classList.contains('intro-pending')).toBe(true);
      expect(container.classList.contains('intro-reveal')).toBe(false);

      const introDebug = fixture.debugElement.query(By.directive(GuestIntroComponent));
      expect(introDebug).not.toBeNull();
      introDebug.componentInstance.exitStarted.emit();
      fixture.detectChanges();

      expect(container.classList.contains('intro-pending')).toBe(false);
      expect(container.classList.contains('intro-reveal')).toBe(true);
      expect(fixture.nativeElement.querySelector('app-guest-intro')).not.toBeNull();

      introDebug.componentInstance.finished.emit();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-guest-intro')).toBeNull();
      expect(fixture.nativeElement.querySelector('ion-content').hasAttribute('inert')).toBe(false);
      expect(container.classList.contains('intro-reveal')).toBe(true);
    });

    it('9. does not apply intro-pending or intro-reveal when intro video is not shown', async () => {
      TestBed.overrideProvider(INTRO_ENVIRONMENT, {
        useValue: fakeEnv({ hasSeen: () => false }),
      });
      mockGuestApi.getInvitation.mockResolvedValue(mockGroupInvitation);

      fixture = TestBed.createComponent(GuestInvitationPage);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('code', 'ABCD1234JK');

      fixture.detectChanges();
      await component.loadInvitation();
      fixture.detectChanges();

      const container = fixture.nativeElement.querySelector('.guest-accessibility-view');
      expect(container.classList.contains('intro-pending')).toBe(false);
      expect(container.classList.contains('intro-reveal')).toBe(false);
    });
  });
});
