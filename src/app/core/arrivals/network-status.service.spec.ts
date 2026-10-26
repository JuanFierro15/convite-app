import { TestBed } from '@angular/core/testing';
import { NetworkStatusService } from './network-status.service';

describe('NetworkStatusService', () => {
  let service: NetworkStatusService;

  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    TestBed.configureTestingModule({});
    service = TestBed.inject(NetworkStatusService);
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('initializes online signal and reacts to network events', async () => {
    expect(service.online()).toBe(true);

    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    window.dispatchEvent(new Event('offline'));
    expect(service.online()).toBe(false);

    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    window.dispatchEvent(new Event('online'));
    expect(service.online()).toBe(true);
  });

  it('triggers onReconnect listener when transitioning from offline to online and supports unsubscribing', () => {
    const reconnectSpy = vi.fn();
    const unsubscribe = service.onReconnect(reconnectSpy);

    // Go offline
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    window.dispatchEvent(new Event('offline'));
    expect(reconnectSpy).not.toHaveBeenCalled();

    // Reconnect -> triggers
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    window.dispatchEvent(new Event('online'));
    expect(reconnectSpy).toHaveBeenCalledTimes(1);

    // Another online event while already online -> does not trigger again
    window.dispatchEvent(new Event('online'));
    expect(reconnectSpy).toHaveBeenCalledTimes(1);

    // Unsubscribe
    unsubscribe();
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    window.dispatchEvent(new Event('offline'));
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    window.dispatchEvent(new Event('online'));
    expect(reconnectSpy).toHaveBeenCalledTimes(1);
  });
});
