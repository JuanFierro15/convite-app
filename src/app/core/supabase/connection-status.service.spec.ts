import { TestBed } from '@angular/core/testing';
import { ConnectionStatusService } from './connection-status.service';

describe('ConnectionStatusService', () => {
  let service: ConnectionStatusService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ConnectionStatusService);
  });

  it('starts with retrying and slow as false and unreachable as false', () => {
    expect(service.retrying()).toBe(false);
    expect(service.slow()).toBe(false);
    expect(service.unreachable()).toBe(false);
  });

  it('updates unreachable based on the last reported status via tracker', () => {
    const trackerA = service.trackRequest();
    const trackerB = service.trackRequest();

    expect(service.unreachable()).toBe(false);

    trackerA.unreachable();
    expect(service.unreachable()).toBe(true);

    trackerB.reachable();
    expect(service.unreachable()).toBe(false);

    trackerB.unreachable();
    expect(service.unreachable()).toBe(true);

    trackerA.reachable();
    expect(service.unreachable()).toBe(false);
  });

  it('does not reset unreachable when tracker finishes', () => {
    const tracker = service.trackRequest();
    tracker.unreachable();
    expect(service.unreachable()).toBe(true);

    tracker.finish();
    expect(service.unreachable()).toBe(true);
  });

  it('tracks two concurrent requests independently', () => {
    const trackerA = service.trackRequest();
    const trackerB = service.trackRequest();

    trackerA.markRetrying();
    trackerB.markRetrying();
    trackerA.markSlow();
    trackerB.markSlow();

    expect(service.retrying()).toBe(true);
    expect(service.slow()).toBe(true);

    trackerA.finish();
    expect(service.retrying()).toBe(true);
    expect(service.slow()).toBe(true);

    trackerB.finish();
    expect(service.retrying()).toBe(false);
    expect(service.slow()).toBe(false);
  });

  it('counts repeated markRetrying and markSlow calls only once per tracker', () => {
    const trackerA = service.trackRequest();
    const trackerB = service.trackRequest();

    trackerA.markRetrying();
    trackerA.markRetrying();
    trackerA.markSlow();
    trackerA.markSlow();

    trackerB.markRetrying();

    trackerA.finish();
    expect(service.retrying()).toBe(true);
    expect(service.slow()).toBe(false);

    trackerB.finish();
    expect(service.retrying()).toBe(false);
  });

  it('makes finish idempotent', () => {
    const trackerA = service.trackRequest();
    const trackerB = service.trackRequest();

    trackerA.markRetrying();
    trackerA.markSlow();
    trackerB.markRetrying();
    trackerB.markSlow();

    trackerA.finish();
    trackerA.finish();

    expect(service.retrying()).toBe(true);
    expect(service.slow()).toBe(true);

    trackerB.finish();
    expect(service.retrying()).toBe(false);
    expect(service.slow()).toBe(false);
  });

  it('ignores markRetrying and markSlow calls after finish', () => {
    const tracker = service.trackRequest();

    tracker.finish();
    tracker.markRetrying();
    tracker.markSlow();

    expect(service.retrying()).toBe(false);
    expect(service.slow()).toBe(false);
  });
});
