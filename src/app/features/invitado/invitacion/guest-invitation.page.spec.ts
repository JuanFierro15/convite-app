import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import QRCode from 'qrcode';
import {
  GuestApiService,
  GuestInvitation,
  formatInvitationCode,
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
    map_url: 'https://maps.google.com',
    welcome_message: 'Nos alegra celebrar juntos este momento.',
    rsvp_deadline: '2026-11-15T23:59:59-05:00',
  },
  guests: [
    { id: 'g-1', full_name: 'Carlos Gómez', rsvp: 'pending' },
    { id: 'g-2', full_name: 'Laura Peña', rsvp: 'pending' },
  ],
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
    map_url: 'https://maps.google.com',
    welcome_message: 'Nos alegra celebrar juntos este momento.',
    rsvp_deadline: '2026-11-15T23:59:59-05:00',
  },
  guests: [
    { id: 'g-2', full_name: 'Laura Peña', rsvp: 'pending' },
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

  beforeEach(async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);

    mockGuestApi = {
      getInvitation: vi.fn(),
      setRsvp: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [GuestInvitationPage],
      providers: [
        provideRouter([]),
        { provide: GuestApiService, useValue: mockGuestApi },
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
    expect(titleEl?.textContent?.trim()).toBe('La familia Gómez está invitada');

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

    const instructionEl = entryCard.querySelector('.entry-code-card__instruction');
    expect(instructionEl?.textContent?.trim()).toBe('Muestra este código en la entrada');

    const tipEl = entryCard.querySelector('.entry-code-card__tip');
    expect(tipEl?.textContent?.trim()).toBe(
      'Tómale una captura de pantalla para tenerlo a mano, aunque no haya señal.',
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
    expect(titleEl?.textContent?.trim()).toBe('Laura Peña, te invitamos');

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
      'El plazo para responder ya terminó. Si necesitas cambiar tu respuesta, escríbenos.',
    );
  });

  it('adapts rsvp thanks message to kind', async () => {
    const answeredGroup = {
      ...mockGroupInvitation,
      guests: [
        { id: 'g-1', full_name: 'Carlos Gómez', rsvp: 'accepted' as const },
        { id: 'g-2', full_name: 'Laura Peña', rsvp: 'accepted' as const },
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
