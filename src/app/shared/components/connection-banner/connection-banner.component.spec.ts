import { DOCUMENT } from '@angular/common';
import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConnectionStatusService } from '../../../core';
import { ConnectionBannerComponent } from './connection-banner.component';

const BANNER_TEXT = 'La conexión está lenta, reintentando...';

describe('ConnectionBannerComponent', () => {
  let doc: Document;
  let slowSignal: WritableSignal<boolean>;
  let retryingSignal: WritableSignal<boolean>;

  beforeEach(async () => {
    slowSignal = signal(false);
    retryingSignal = signal(false);

    const mockConnectionStatus = {
      slow: slowSignal.asReadonly(),
      retrying: retryingSignal.asReadonly(),
      trackRequest: () => ({
        markRetrying: () => retryingSignal.set(true),
        markSlow: () => slowSignal.set(true),
        finish: () => {
          retryingSignal.set(false);
          slowSignal.set(false);
        },
      }),
    };

    await TestBed.configureTestingModule({
      imports: [ConnectionBannerComponent],
      providers: [
        { provide: ConnectionStatusService, useValue: mockConnectionStatus },
      ],
    }).compileComponents();

    doc = TestBed.inject(DOCUMENT);
  });

  afterEach(() => {
    doc.documentElement.classList.remove('connection-banner-active');
    doc.documentElement.style.removeProperty('--convite-banner-height');
  });

  function bannerOf(nativeElement: HTMLElement): HTMLElement {
    const banner = nativeElement.querySelector<HTMLElement>('.connection-banner');
    if (!banner) {
      throw new Error('connection banner not rendered');
    }
    return banner;
  }

  it('keeps an empty live region in the DOM when retrying and slow are false', () => {
    const fixture = TestBed.createComponent(ConnectionBannerComponent);
    fixture.detectChanges();

    const banner = bannerOf(fixture.nativeElement);
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.getAttribute('aria-live')).toBe('polite');
    expect(banner.textContent?.trim()).toBe('');
    expect(banner.classList.contains('connection-banner--visible')).toBe(false);
  });

  it('shows the text in the same element when retrying is true and clears it when finished', () => {
    const fixture = TestBed.createComponent(ConnectionBannerComponent);
    fixture.detectChanges();
    const banner = bannerOf(fixture.nativeElement);

    retryingSignal.set(true);
    fixture.detectChanges();

    expect(bannerOf(fixture.nativeElement)).toBe(banner);
    expect(banner.textContent?.trim()).toBe(BANNER_TEXT);
    expect(banner.classList.contains('connection-banner--visible')).toBe(true);

    retryingSignal.set(false);
    fixture.detectChanges();

    expect(bannerOf(fixture.nativeElement)).toBe(banner);
    expect(banner.textContent?.trim()).toBe('');
    expect(banner.classList.contains('connection-banner--visible')).toBe(false);
  });

  it('shows the text when slow is true and clears it when finished', () => {
    const fixture = TestBed.createComponent(ConnectionBannerComponent);
    const banner = bannerOf(fixture.nativeElement);

    slowSignal.set(true);
    fixture.detectChanges();

    expect(banner.textContent?.trim()).toBe(BANNER_TEXT);
    expect(banner.classList.contains('connection-banner--visible')).toBe(true);

    slowSignal.set(false);
    fixture.detectChanges();

    expect(banner.textContent?.trim()).toBe('');
  });

  it('oculta al inicio: <html> no tiene la clase ni la variable', () => {
    const fixture = TestBed.createComponent(ConnectionBannerComponent);
    fixture.detectChanges();

    expect(doc.documentElement.classList.contains('connection-banner-active')).toBe(false);
    expect(doc.documentElement.style.getPropertyValue('--convite-banner-height')).toBe('');
  });

  it('al pasar slow a verdadero: <html> tiene connection-banner-active y --convite-banner-height termina en px', () => {
    const fixture = TestBed.createComponent(ConnectionBannerComponent);
    fixture.detectChanges();

    const banner = bannerOf(fixture.nativeElement);
    vi.spyOn(banner, 'getBoundingClientRect').mockReturnValue({
      height: 29,
      width: 360,
      top: 0,
      bottom: 29,
      left: 0,
      right: 360,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    slowSignal.set(true);
    fixture.detectChanges();

    expect(doc.documentElement.classList.contains('connection-banner-active')).toBe(true);
    expect(doc.documentElement.style.getPropertyValue('--convite-banner-height')).toBe('29px');
  });

  it('al pasar retrying a verdadero: <html> tiene connection-banner-active y --convite-banner-height termina en px', () => {
    const fixture = TestBed.createComponent(ConnectionBannerComponent);
    fixture.detectChanges();

    const banner = bannerOf(fixture.nativeElement);
    vi.spyOn(banner, 'getBoundingClientRect').mockReturnValue({
      height: 35,
      width: 360,
      top: 0,
      bottom: 35,
      left: 0,
      right: 360,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    retryingSignal.set(true);
    fixture.detectChanges();

    expect(doc.documentElement.classList.contains('connection-banner-active')).toBe(true);
    expect(doc.documentElement.style.getPropertyValue('--convite-banner-height')).toBe('35px');
  });

  it('al volver a falso: se quitan la clase y la variable', () => {
    const fixture = TestBed.createComponent(ConnectionBannerComponent);
    fixture.detectChanges();

    slowSignal.set(true);
    fixture.detectChanges();

    expect(doc.documentElement.classList.contains('connection-banner-active')).toBe(true);
    expect(doc.documentElement.style.getPropertyValue('--convite-banner-height')).not.toBe('');

    slowSignal.set(false);
    fixture.detectChanges();

    expect(doc.documentElement.classList.contains('connection-banner-active')).toBe(false);
    expect(doc.documentElement.style.getPropertyValue('--convite-banner-height')).toBe('');
  });

  it('al destruir el componente estando visible: se quitan la clase y la variable', () => {
    const fixture = TestBed.createComponent(ConnectionBannerComponent);
    fixture.detectChanges();

    slowSignal.set(true);
    fixture.detectChanges();

    expect(doc.documentElement.classList.contains('connection-banner-active')).toBe(true);
    expect(doc.documentElement.style.getPropertyValue('--convite-banner-height')).not.toBe('');

    fixture.destroy();

    expect(doc.documentElement.classList.contains('connection-banner-active')).toBe(false);
    expect(doc.documentElement.style.getPropertyValue('--convite-banner-height')).toBe('');
  });

  it('actualiza el alto si el ResizeObserver detecta un cambio de tamano', () => {
    let notifyObserver: ((entries: ResizeObserverEntry[], observer: ResizeObserver) => void) | null = null;
    class MockResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        notifyObserver = cb;
      }
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
    const originalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

    try {
      const fixture = TestBed.createComponent(ConnectionBannerComponent);
      fixture.detectChanges();

      const banner = bannerOf(fixture.nativeElement);
      let currentHeight = 30;
      vi.spyOn(banner, 'getBoundingClientRect').mockImplementation(() => ({
        height: currentHeight,
        width: 360,
        top: 0,
        bottom: currentHeight,
        left: 0,
        right: 360,
        x: 0,
        y: 0,
        toJSON: () => {},
      }));

      slowSignal.set(true);
      fixture.detectChanges();

      expect(doc.documentElement.style.getPropertyValue('--convite-banner-height')).toBe('30px');

      currentHeight = 54;
      if (notifyObserver) {
        (notifyObserver as ResizeObserverCallback)([], {} as ResizeObserver);
      }

      expect(doc.documentElement.style.getPropertyValue('--convite-banner-height')).toBe('54px');
    } finally {
      globalThis.ResizeObserver = originalResizeObserver;
    }
  });

  it('desconecta el ResizeObserver al ocultarse la franja', () => {
    const disconnectSpy = vi.fn();
    class MockResizeObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = disconnectSpy;
    }
    const originalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

    try {
      const fixture = TestBed.createComponent(ConnectionBannerComponent);
      fixture.detectChanges();

      slowSignal.set(true);
      fixture.detectChanges();

      expect(disconnectSpy).not.toHaveBeenCalled();

      slowSignal.set(false);
      fixture.detectChanges();

      expect(disconnectSpy).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.ResizeObserver = originalResizeObserver;
    }
  });

  it('desconecta el ResizeObserver al destruirse el componente', () => {
    const disconnectSpy = vi.fn();
    class MockResizeObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = disconnectSpy;
    }
    const originalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

    try {
      const fixture = TestBed.createComponent(ConnectionBannerComponent);
      fixture.detectChanges();

      slowSignal.set(true);
      fixture.detectChanges();

      fixture.destroy();

      expect(disconnectSpy).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.ResizeObserver = originalResizeObserver;
    }
  });
});
