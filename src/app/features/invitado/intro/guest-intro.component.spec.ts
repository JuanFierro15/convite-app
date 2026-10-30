import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  GuestIntroComponent,
  INTRO_FADE_MS,
  INTRO_MAX_DURATION_MS,
  INTRO_START_TIMEOUT_MS,
} from './guest-intro.component';
import {
  INTRO_ENVIRONMENT,
  IntroEnvironment,
} from './intro-environment';

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

describe('GuestIntroComponent', () => {
  let playSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;
  let loadSpy: ReturnType<typeof vi.spyOn>;
  let mockEnv: ReturnType<typeof fakeEnv>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockEnv = fakeEnv();
    playSpy = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined);
    pauseSpy = vi
      .spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => undefined);
    loadSpy = vi
      .spyOn(HTMLMediaElement.prototype, 'load')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function createIntroComponent(
    options: {
      code?: string;
      themeId?: string;
      envOverrides?: Partial<IntroEnvironment>;
    } = {},
  ): Promise<{
    fixture: ComponentFixture<GuestIntroComponent>;
    component: GuestIntroComponent;
    getFinishedCount: () => number;
    getExitStartedCount: () => number;
  }> {
    if (options.envOverrides) {
      mockEnv = fakeEnv(options.envOverrides);
    }

    await TestBed.configureTestingModule({
      imports: [GuestIntroComponent],
      providers: [{ provide: INTRO_ENVIRONMENT, useValue: mockEnv }],
    }).compileComponents();

    const fixture = TestBed.createComponent(GuestIntroComponent);
    const component = fixture.componentInstance;
    let finishedCount = 0;
    let exitStartedCount = 0;
    component.finished.subscribe(() => {
      finishedCount++;
    });
    component.exitStarted.subscribe(() => {
      exitStartedCount++;
    });

    fixture.componentRef.setInput('code', options.code ?? 'ABCD1234JK');
    fixture.componentRef.setInput('themeId', options.themeId ?? 'honey-bee');

    fixture.detectChanges();
    await fixture.whenStable();

    return {
      fixture,
      component,
      getFinishedCount: () => finishedCount,
      getExitStartedCount: () => exitStartedCount,
    };
  }

  it('1. configures vertical video sources, poster, muted, and calls play once in portrait', async () => {
    const { fixture } = await createIntroComponent();

    const videoEl = fixture.nativeElement.querySelector(
      '.intro__video',
    ) as HTMLVideoElement;
    expect(videoEl).not.toBeNull();
    expect(
      videoEl.src.endsWith('assets/video/honey-bee/intro-vertical.v3.mp4'),
    ).toBe(true);
    expect(
      videoEl.getAttribute('poster')?.endsWith('intro-vertical.v3.webp'),
    ).toBe(true);
    expect(videoEl.muted).toBe(true);
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it('2. configures horizontal video source when in landscape', async () => {
    const { fixture } = await createIntroComponent({
      envOverrides: { isPortrait: () => false },
    });

    const videoEl = fixture.nativeElement.querySelector(
      '.intro__video',
    ) as HTMLVideoElement;
    expect(
      videoEl.src.endsWith('assets/video/honey-bee/intro-horizontal.v3.mp4'),
    ).toBe(true);
  });

  it('3. theme without video emits finished after fade without play or src', async () => {
    const { fixture, getFinishedCount, getExitStartedCount } = await createIntroComponent({
      themeId: 'baby-shower',
    });

    const videoEl = fixture.nativeElement.querySelector(
      '.intro__video',
    ) as HTMLVideoElement;
    expect(videoEl.getAttribute('src')).toBeNull();
    expect(playSpy).not.toHaveBeenCalled();

    expect(getExitStartedCount()).toBe(1);
    expect(getFinishedCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(INTRO_FADE_MS - 1);
    expect(getFinishedCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(getFinishedCount()).toBe(1);
  });

  it('4. manual skip marks code as seen, releases video, fades out and emits once', async () => {
    const { fixture, component, getFinishedCount, getExitStartedCount } = await createIntroComponent();

    const skipBtn = fixture.nativeElement.querySelector(
      '.intro__skip',
    ) as HTMLButtonElement;
    const videoEl = fixture.nativeElement.querySelector(
      '.intro__video',
    ) as HTMLVideoElement;

    skipBtn.click();
    fixture.detectChanges();

    expect(mockEnv.markSeen).toHaveBeenCalledWith('ABCD1234JK');
    expect(pauseSpy).toHaveBeenCalled();
    expect(loadSpy).toHaveBeenCalled();
    expect(videoEl.getAttribute('src')).toBeNull();
    expect(component.videoHidden()).toBe(true);
    expect(videoEl.classList.contains('intro__video--hidden')).toBe(true);

    const introDiv = fixture.nativeElement.querySelector('.intro');
    expect(introDiv.classList.contains('intro--leaving')).toBe(true);

    expect(getExitStartedCount()).toBe(1);
    expect(getFinishedCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(INTRO_FADE_MS - 1);
    expect(getFinishedCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(getFinishedCount()).toBe(1);

    // Un segundo clic no vuelve a emitir ni a llamar markSeen
    skipBtn.click();
    await vi.advanceTimersByTimeAsync(INTRO_FADE_MS);
    expect(getFinishedCount()).toBe(1);
    expect(getExitStartedCount()).toBe(1);
    expect(mockEnv.markSeen).toHaveBeenCalledTimes(1);
  });

  it('5. timeout skip: play resolves but no playing event arrives within 2s, does not call markSeen', async () => {
    const { getFinishedCount, getExitStartedCount } = await createIntroComponent();

    await vi.advanceTimersByTimeAsync(INTRO_START_TIMEOUT_MS - 1);
    expect(getExitStartedCount()).toBe(0);
    expect(getFinishedCount()).toBe(0);
    expect(mockEnv.markSeen).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(getExitStartedCount()).toBe(1);
    expect(getFinishedCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(INTRO_FADE_MS);
    expect(getFinishedCount()).toBe(1);
    expect(mockEnv.markSeen).not.toHaveBeenCalled();
  });

  it('6. playing event cancels start timer, marks seen once, and keeps frame on ended event', async () => {
    const { fixture, component, getFinishedCount, getExitStartedCount } = await createIntroComponent();

    const videoEl = fixture.nativeElement.querySelector(
      '.intro__video',
    ) as HTMLVideoElement;

    await vi.advanceTimersByTimeAsync(500);
    videoEl.dispatchEvent(new Event('playing'));
    fixture.detectChanges();

    expect(mockEnv.markSeen).toHaveBeenCalledTimes(1);
    expect(mockEnv.markSeen).toHaveBeenCalledWith('ABCD1234JK');

    // Avanza 5000 ms más: el video sigue reproduciéndose y no ha terminado
    await vi.advanceTimersByTimeAsync(5000);
    expect(getExitStartedCount()).toBe(0);
    expect(getFinishedCount()).toBe(0);

    const removeAttributeSpy = vi.spyOn(videoEl, 'removeAttribute');
    loadSpy.mockClear();

    // Se despacha ended
    videoEl.dispatchEvent(new Event('ended'));
    fixture.detectChanges();

    expect(removeAttributeSpy).not.toHaveBeenCalledWith('src');
    expect(loadSpy).not.toHaveBeenCalled();
    expect(videoEl.getAttribute('src')).not.toBeNull();
    expect(component.videoHidden()).toBe(false);
    expect(videoEl.classList.contains('intro__video--hidden')).toBe(false);

    const introDiv = fixture.nativeElement.querySelector('.intro');
    expect(introDiv.classList.contains('intro--leaving')).toBe(true);

    expect(getExitStartedCount()).toBe(1);
    expect(getFinishedCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(INTRO_FADE_MS - 1);
    expect(getFinishedCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(getFinishedCount()).toBe(1);

    // Al destruir el fixture, cleanup() libera el video
    fixture.destroy();
    expect(loadSpy).toHaveBeenCalled();
  });

  it('7. maximum duration timeout: exits at INTRO_MAX_DURATION_MS + INTRO_FADE_MS if ended never arrives', async () => {
    const { fixture, getFinishedCount, getExitStartedCount } = await createIntroComponent();

    const videoEl = fixture.nativeElement.querySelector(
      '.intro__video',
    ) as HTMLVideoElement;

    await vi.advanceTimersByTimeAsync(500);
    videoEl.dispatchEvent(new Event('playing'));
    fixture.detectChanges();

    await vi.advanceTimersByTimeAsync(INTRO_MAX_DURATION_MS - 1);
    expect(getExitStartedCount()).toBe(0);
    expect(getFinishedCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(getExitStartedCount()).toBe(1);
    expect(getFinishedCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(INTRO_FADE_MS);
    expect(getFinishedCount()).toBe(1);
  });

  it('8. play rejection triggers immediate exit without markSeen and emits after fade', async () => {
    playSpy.mockRejectedValue(new Error('NotAllowedError'));

    const { getFinishedCount, getExitStartedCount } = await createIntroComponent();

    // Espera a que se procese el rechazo de la promesa
    await vi.advanceTimersByTimeAsync(0);

    expect(getExitStartedCount()).toBe(1);
    expect(getFinishedCount()).toBe(0);
    expect(mockEnv.markSeen).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(INTRO_FADE_MS);
    expect(getFinishedCount()).toBe(1);
    expect(mockEnv.markSeen).not.toHaveBeenCalled();
  });

  it('9. error event triggers exit after fade without markSeen', async () => {
    const { fixture, getFinishedCount, getExitStartedCount } = await createIntroComponent();

    const videoEl = fixture.nativeElement.querySelector(
      '.intro__video',
    ) as HTMLVideoElement;

    videoEl.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(getExitStartedCount()).toBe(1);
    expect(getFinishedCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(INTRO_FADE_MS);
    expect(getFinishedCount()).toBe(1);
    expect(mockEnv.markSeen).not.toHaveBeenCalled();
  });

  it('10. Escape key on container triggers skip flow', async () => {
    const { fixture, getFinishedCount, getExitStartedCount } = await createIntroComponent();

    const introDiv = fixture.nativeElement.querySelector(
      '.intro',
    ) as HTMLDivElement;

    introDiv.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();

    expect(mockEnv.markSeen).toHaveBeenCalledWith('ABCD1234JK');
    expect(getExitStartedCount()).toBe(1);
    expect(getFinishedCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(INTRO_FADE_MS);
    expect(getFinishedCount()).toBe(1);
  });

  it('11. skip button has correct text, aria-label, type button and receives focus', async () => {
    const { fixture } = await createIntroComponent();

    const skipBtn = fixture.nativeElement.querySelector(
      '.intro__skip',
    ) as HTMLButtonElement;
    expect(skipBtn).not.toBeNull();
    expect(skipBtn.textContent?.trim()).toBe('Saltar');
    expect(skipBtn.getAttribute('aria-label')).toBe(
      'Saltar video de bienvenida',
    );
    expect(skipBtn.type).toBe('button');
    expect(document.activeElement).toBe(skipBtn);
  });
});
