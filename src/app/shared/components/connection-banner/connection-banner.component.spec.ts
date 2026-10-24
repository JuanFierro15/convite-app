import { TestBed } from '@angular/core/testing';
import { ConnectionStatusService } from '../../../core';
import { ConnectionBannerComponent } from './connection-banner.component';

const BANNER_TEXT = 'La conexión está lenta, reintentando...';

describe('ConnectionBannerComponent', () => {
  let connectionStatus: ConnectionStatusService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConnectionBannerComponent],
    }).compileComponents();

    connectionStatus = TestBed.inject(ConnectionStatusService);
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
    const tracker = connectionStatus.trackRequest();

    tracker.markRetrying();
    fixture.detectChanges();

    expect(bannerOf(fixture.nativeElement)).toBe(banner);
    expect(banner.textContent?.trim()).toBe(BANNER_TEXT);
    expect(banner.classList.contains('connection-banner--visible')).toBe(true);

    tracker.finish();
    fixture.detectChanges();

    expect(bannerOf(fixture.nativeElement)).toBe(banner);
    expect(banner.textContent?.trim()).toBe('');
    expect(banner.classList.contains('connection-banner--visible')).toBe(false);
  });

  it('shows the text when slow is true and clears it when finished', () => {
    const fixture = TestBed.createComponent(ConnectionBannerComponent);
    const tracker = connectionStatus.trackRequest();

    tracker.markSlow();
    fixture.detectChanges();

    const banner = bannerOf(fixture.nativeElement);
    expect(banner.textContent?.trim()).toBe(BANNER_TEXT);
    expect(banner.classList.contains('connection-banner--visible')).toBe(true);

    tracker.finish();
    fixture.detectChanges();

    expect(banner.textContent?.trim()).toBe('');
  });
});
