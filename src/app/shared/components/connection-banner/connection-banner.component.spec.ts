import { TestBed } from '@angular/core/testing';
import { ConnectionStatusService } from '../../../core';
import { ConnectionBannerComponent } from './connection-banner.component';

describe('ConnectionBannerComponent', () => {
  let connectionStatus: ConnectionStatusService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConnectionBannerComponent],
    }).compileComponents();

    connectionStatus = TestBed.inject(ConnectionStatusService);
  });

  it('does not render anything when retrying and slow are false', () => {
    const fixture = TestBed.createComponent(ConnectionBannerComponent);
    fixture.detectChanges();

    const banner: HTMLElement | null =
      fixture.nativeElement.querySelector('.connection-banner');
    expect(banner).toBeNull();
  });

  it('renders the banner text when retrying is true and hides it when finished', () => {
    const fixture = TestBed.createComponent(ConnectionBannerComponent);
    const tracker = connectionStatus.trackRequest();

    tracker.markRetrying();
    fixture.detectChanges();

    const banner: HTMLElement | null =
      fixture.nativeElement.querySelector('.connection-banner');
    expect(banner).toBeTruthy();
    expect(banner?.textContent?.trim()).toBe('La conexión está lenta, reintentando...');
    expect(banner?.getAttribute('role')).toBe('status');
    expect(banner?.getAttribute('aria-live')).toBe('polite');

    tracker.finish();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.connection-banner')).toBeNull();
  });

  it('renders the banner text when slow is true and hides it when finished', () => {
    const fixture = TestBed.createComponent(ConnectionBannerComponent);
    const tracker = connectionStatus.trackRequest();

    tracker.markSlow();
    fixture.detectChanges();

    const banner: HTMLElement | null =
      fixture.nativeElement.querySelector('.connection-banner');
    expect(banner).toBeTruthy();
    expect(banner?.textContent?.trim()).toBe('La conexión está lenta, reintentando...');

    tracker.finish();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.connection-banner')).toBeNull();
  });
});
