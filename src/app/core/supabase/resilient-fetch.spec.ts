import { TestBed } from '@angular/core/testing';
import { ConnectionStatusService } from './connection-status.service';
import {
  RETRYABLE_RPCS,
  RequestTimeoutError,
  createResilientFetch,
  isRetryableRequest,
  isRetryableStatus,
} from './resilient-fetch';

const BASE_URL = 'https://ejemplo.supabase.co';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function neverRespondingFetch(): typeof fetch {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      signal?.addEventListener(
        'abort',
        () => {
          reject(signal.reason);
        },
        { once: true },
      );
    });
  });
}

describe('resilient-fetch', () => {
  it('1. GET /rest/v1/invitations with 200 on first try makes 1 call and returns readable JSON', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse([{ id: 'inv-1', guest_name: 'Familia Ejemplo' }], 200));

    const resilientFetch = createResilientFetch(null, {
      fetchImpl,
      random: () => 0,
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    const response = await resilientFetch(`${BASE_URL}/rest/v1/invitations`);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { id: 'inv-1', guest_name: 'Familia Ejemplo' },
    ]);
  });

  it('2. GET with 503 then 200 makes 2 calls, returns 200, and sleep receives 500', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('Service Unavailable', { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);

    const resilientFetch = createResilientFetch(null, {
      fetchImpl,
      random: () => 0,
      sleep,
    });

    const response = await resilientFetch(`${BASE_URL}/rest/v1/invitations`);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(500);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('3. GET with network error (TypeError) three times makes 3 calls, sleeps 500 and 1500, and rejects with TypeError', async () => {
    const networkError = new TypeError('Failed to fetch');
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(networkError);
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);

    const resilientFetch = createResilientFetch(null, {
      fetchImpl,
      random: () => 0,
      sleep,
    });

    await expect(resilientFetch(`${BASE_URL}/rest/v1/invitations`)).rejects.toThrow(networkError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([500, 1500]);
  });

  it('4. GET that always returns 522 makes 3 calls and returns the 522 response', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response('Connection timed out', { status: 522 }));
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);

    const resilientFetch = createResilientFetch(null, {
      fetchImpl,
      random: () => 0,
      sleep,
    });

    const response = await resilientFetch(`${BASE_URL}/rest/v1/invitations`);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(522);
  });

  it('5. GET that never responds rejects with RequestTimeoutError after 3 attempts', async () => {
    const fetchImpl = neverRespondingFetch();
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);

    const resilientFetch = createResilientFetch(null, {
      fetchImpl,
      timeoutMs: 20,
      random: () => 0,
      sleep,
    });

    let caughtError: unknown;
    try {
      await resilientFetch(`${BASE_URL}/rest/v1/invitations`);
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(RequestTimeoutError);
    expect((caughtError as RequestTimeoutError).name).toBe('TimeoutError');
    expect((caughtError as RequestTimeoutError).message).toBe('request_timeout');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('6. POST /rest/v1/invitations with 503 makes 1 call and returns 503', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('Unavailable', { status: 503 }));
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);

    const resilientFetch = createResilientFetch(null, {
      fetchImpl,
      random: () => 0,
      sleep,
    });

    const response = await resilientFetch(`${BASE_URL}/rest/v1/invitations`, {
      method: 'POST',
      body: JSON.stringify({ guest_name: 'Familia Ejemplo' }),
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(response.status).toBe(503);
  });

  it('7. POST /rest/v1/rpc/release_gift with network error makes 1 call and rejects', async () => {
    const networkError = new TypeError('Network failure');
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValueOnce(networkError);
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);

    const resilientFetch = createResilientFetch(null, {
      fetchImpl,
      random: () => 0,
      sleep,
    });

    await expect(
      resilientFetch(`${BASE_URL}/rest/v1/rpc/release_gift`, { method: 'POST' }),
    ).rejects.toThrow(networkError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('8. POST /rest/v1/rpc/save_invitation with 520 then 200 makes 2 calls', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('Cloudflare 520', { status: 520 }))
      .mockResolvedValueOnce(jsonResponse({ id: 'inv-1' }, 200));
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);

    const resilientFetch = createResilientFetch(null, {
      fetchImpl,
      random: () => 0,
      sleep,
    });

    const response = await resilientFetch(`${BASE_URL}/rest/v1/rpc/save_invitation`, {
      method: 'POST',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
  });

  it('8b. POST /rest/v1/rpc/record_arrivals with 503 then 200 is retryable and makes 2 calls', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('Service Unavailable', { status: 503 }))
      .mockResolvedValueOnce(jsonResponse([{ guest_id: 'guest-1', status: 'recorded' }], 200));
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);

    const resilientFetch = createResilientFetch(null, {
      fetchImpl,
      random: () => 0,
      sleep,
    });

    const response = await resilientFetch(`${BASE_URL}/rest/v1/rpc/record_arrivals`, {
      method: 'POST',
      body: JSON.stringify({ p_event_id: 'event-1', p_arrivals: [] }),
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([{ guest_id: 'guest-1', status: 'recorded' }]);
  });

  it('9. POST /auth/v1/token?grant_type=password makes 1 call on network error and uses authTimeoutMs when hanging', async () => {
    const networkError = new TypeError('Auth network failure');
    const failingFetch = vi.fn<typeof fetch>().mockRejectedValueOnce(networkError);
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);

    const resilientFetch = createResilientFetch(null, {
      fetchImpl: failingFetch,
      random: () => 0,
      sleep,
    });

    await expect(
      resilientFetch(`${BASE_URL}/auth/v1/token?grant_type=password`, { method: 'POST' }),
    ).rejects.toThrow(networkError);
    expect(failingFetch).toHaveBeenCalledTimes(1);

    const delayedAuthFetch = vi.fn<typeof fetch>((_input, init) => {
      return new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve(jsonResponse({ access_token: 'ficticio' }, 200));
        }, 35);

        init?.signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(init.signal?.reason);
          },
          { once: true },
        );
      });
    });

    const authFetchWithLongerAuthTimeout = createResilientFetch(null, {
      fetchImpl: delayedAuthFetch,
      timeoutMs: 15,
      authTimeoutMs: 80,
      random: () => 0,
      sleep,
    });

    const authResponse = await authFetchWithLongerAuthTimeout(
      `${BASE_URL}/auth/v1/token?grant_type=password`,
      { method: 'POST' },
    );
    expect(authResponse.status).toBe(200);

    const hangingAuthFetch = neverRespondingFetch();
    const authFetchWithShortAuthTimeout = createResilientFetch(null, {
      fetchImpl: hangingAuthFetch,
      timeoutMs: 100,
      authTimeoutMs: 20,
      random: () => 0,
      sleep,
    });

    await expect(
      authFetchWithShortAuthTimeout(`${BASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
      }),
    ).rejects.toBeInstanceOf(RequestTimeoutError);
    expect(hangingAuthFetch).toHaveBeenCalledTimes(1);
  });

  it.each([400, 401, 404, 409])(
    '10. GET returning status %i makes 1 call without retry',
    async (status) => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response('Client error', { status }));
      const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);

      const resilientFetch = createResilientFetch(null, {
        fetchImpl,
        random: () => 0,
        sleep,
      });

      const response = await resilientFetch(`${BASE_URL}/rest/v1/invitations`);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
      expect(response.status).toBe(status);
    },
  );

  it('11. Caller signal already aborted rejects without calling fetchImpl; aborted during attempt rejects with reason and no retries', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
    const resilientFetch = createResilientFetch(null, {
      fetchImpl,
      random: () => 0,
      sleep,
    });

    const preAbortedController = new AbortController();
    const preAbortReason = new Error('cancelled_before_start');
    preAbortedController.abort(preAbortReason);

    await expect(
      resilientFetch(`${BASE_URL}/rest/v1/invitations`, {
        signal: preAbortedController.signal,
      }),
    ).rejects.toBe(preAbortReason);
    expect(fetchImpl).not.toHaveBeenCalled();

    const inFlightController = new AbortController();
    const inFlightReason = new Error('cancelled_in_flight');
    const hangingFetch = neverRespondingFetch();
    const inFlightResilientFetch = createResilientFetch(null, {
      fetchImpl: hangingFetch,
      timeoutMs: 500,
      random: () => 0,
      sleep,
    });

    setTimeout(() => {
      inFlightController.abort(inFlightReason);
    }, 15);

    await expect(
      inFlightResilientFetch(`${BASE_URL}/rest/v1/invitations`, {
        signal: inFlightController.signal,
      }),
    ).rejects.toBe(inFlightReason);
    expect(hangingFetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('12. Updates real ConnectionStatusService signals during retry and slow requests and resets them on finish', async () => {
    TestBed.configureTestingModule({});
    const statusService = TestBed.inject(ConnectionStatusService);

    let retryingDuringSecondAttempt = false;
    const retryFetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }))
      .mockImplementationOnce(async () => {
        retryingDuringSecondAttempt = statusService.retrying();
        return jsonResponse({ ok: true }, 200);
      });

    const retryFetch = createResilientFetch(statusService, {
      fetchImpl: retryFetchImpl,
      random: () => 0,
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    expect(statusService.retrying()).toBe(false);
    await retryFetch(`${BASE_URL}/rest/v1/invitations`);
    expect(retryingDuringSecondAttempt).toBe(true);
    expect(statusService.retrying()).toBe(false);

    let slowWhileWaiting = false;
    const slowFetchImpl = vi.fn<typeof fetch>(() => {
      return new Promise<Response>((resolve) => {
        setTimeout(() => {
          slowWhileWaiting = statusService.slow();
          resolve(jsonResponse({ ok: true }, 200));
        }, 35);
      });
    });

    const slowFetch = createResilientFetch(statusService, {
      fetchImpl: slowFetchImpl,
      slowAfterMs: 15,
      random: () => 0,
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    expect(statusService.slow()).toBe(false);
    await slowFetch(`${BASE_URL}/rest/v1/invitations`);
    expect(slowWhileWaiting).toBe(true);
    expect(statusService.slow()).toBe(false);
  });

  describe('13. isRetryableRequest and isRetryableStatus table of cases', () => {
    it.each([
      ['GET', `${BASE_URL}/rest/v1/invitations`, true],
      ['HEAD', `${BASE_URL}/rest/v1/invitations`, true],
      ['PATCH', `${BASE_URL}/rest/v1/invitations?id=eq.1`, true],
      ['DELETE', `${BASE_URL}/rest/v1/invitations?id=eq.1`, true],
      ['get', `${BASE_URL}/rest/v1/gifts`, true],
      ['POST', `${BASE_URL}/rest/v1/invitations`, false],
      ['PUT', `${BASE_URL}/rest/v1/invitations`, false],
      ...RETRYABLE_RPCS.map(
        (rpc): [string, string, boolean] => ['POST', `${BASE_URL}/rest/v1/rpc/${rpc}`, true],
      ),
      ['POST', `${BASE_URL}/rest/v1/rpc/release_gift`, false],
      ['POST', `${BASE_URL}/rest/v1/rpc/unknown_rpc`, false],
      ['GET', `${BASE_URL}/auth/v1/user`, false],
      ['POST', `${BASE_URL}/auth/v1/token?grant_type=password`, false],
      ['GET', `${BASE_URL}/storage/v1/object/public/assets/cover.webp`, false],
    ])('isRetryableRequest(%s, %s) returns %s', (method, url, expected) => {
      expect(isRetryableRequest(method, url)).toBe(expected);
    });

    it.each([
      [200, false],
      [204, false],
      [400, false],
      [401, false],
      [404, false],
      [409, false],
      [500, false],
      [501, false],
      [502, true],
      [503, true],
      [504, true],
      [505, false],
      [519, false],
      [520, true],
      [521, true],
      [522, true],
      [523, true],
      [524, true],
      [525, true],
      [526, true],
      [527, true],
      [528, false],
    ])('isRetryableStatus(%i) returns %s', (status, expected) => {
      expect(isRetryableStatus(status)).toBe(expected);
    });
  });

  it('never retries when input is a Request instance and skips body reading for HEAD and 204', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('Unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);

    const resilientFetch = createResilientFetch(null, {
      fetchImpl,
      random: () => 0,
      sleep,
    });

    const req = new Request(`${BASE_URL}/rest/v1/invitations`, { method: 'GET' });
    const response = await resilientFetch(req);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(503);

    const noContentResponse = await resilientFetch(new URL(`${BASE_URL}/rest/v1/invitations`), {
      method: 'HEAD',
    });
    expect(noContentResponse.status).toBe(204);
  });
});
