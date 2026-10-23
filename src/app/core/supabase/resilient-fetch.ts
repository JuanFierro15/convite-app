import { ConnectionStatusService } from './connection-status.service';

export class RequestTimeoutError extends Error {
  constructor() {
    super('request_timeout');
    this.name = 'TimeoutError';
  }
}

export const RETRYABLE_RPCS: readonly string[] = [
  'save_invitation',
  'get_invitation',
  'get_gifts',
  'set_rsvp',
  'reserve_gift',
];

export interface ResilientFetchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  authTimeoutMs?: number;
  retryDelaysMs?: readonly number[];
  jitterMs?: number;
  slowAfterMs?: number;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_AUTH_TIMEOUT_MS = 15_000;
const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [500, 1500];
const DEFAULT_JITTER_MS = 250;
const DEFAULT_SLOW_AFTER_MS = 4_000;
const NULL_BODY_STATUSES: ReadonlySet<number> = new Set([101, 204, 205, 304]);
const RETRYABLE_REST_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'PATCH', 'DELETE']);

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function extractPathname(url: string): string {
  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    return url.split('?')[0] ?? '';
  }
}

function getAbortReason(signal: AbortSignal): unknown {
  return signal.reason !== undefined
    ? signal.reason
    : new DOMException('The operation was aborted.', 'AbortError');
}

function withSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(getAbortReason(signal));
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(getAbortReason(signal));
    };

    signal.addEventListener('abort', onAbort, { once: true });

    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

export function isRetryableStatus(status: number): boolean {
  return (status >= 502 && status <= 504) || (status >= 520 && status <= 527);
}

export function isRetryableRequest(method: string, url: string): boolean {
  const pathname = extractPathname(url);
  if (pathname.includes('/auth/v1/')) {
    return false;
  }

  const restPrefix = '/rest/v1/';
  const restIndex = pathname.indexOf(restPrefix);
  if (restIndex === -1) {
    return false;
  }

  const normalizedMethod = method.toUpperCase();
  if (RETRYABLE_REST_METHODS.has(normalizedMethod)) {
    return true;
  }

  if (normalizedMethod === 'POST') {
    const subPath = pathname.slice(restIndex + restPrefix.length);
    if (subPath.startsWith('rpc/')) {
      const rpcName = subPath.slice('rpc/'.length);
      return RETRYABLE_RPCS.includes(rpcName);
    }
  }

  return false;
}

export function createResilientFetch(
  status: Pick<ConnectionStatusService, 'trackRequest'> | null,
  options?: ResilientFetchOptions,
): typeof fetch {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const authTimeoutMs = options?.authTimeoutMs ?? DEFAULT_AUTH_TIMEOUT_MS;
  const retryDelaysMs = options?.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const jitterMs = options?.jitterMs ?? DEFAULT_JITTER_MS;
  const slowAfterMs = options?.slowAfterMs ?? DEFAULT_SLOW_AFTER_MS;
  const random = options?.random ?? Math.random;
  const sleep = options?.sleep ?? defaultSleep;

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const fetchImpl = options?.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

    const isRequestInput = typeof Request !== 'undefined' && input instanceof Request;
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method = (init?.method ?? (isRequestInput ? input.method : 'GET')).toUpperCase();

    const canRetry = !isRequestInput && isRetryableRequest(method, url);
    const pathname = extractPathname(url);
    const attemptTimeoutMs = pathname.includes('/auth/v1/') ? authTimeoutMs : timeoutMs;
    const maxAttempts = canRetry ? 1 + retryDelaysMs.length : 1;
    const callerSignal = init?.signal ?? undefined;

    const tracker = status ? status.trackRequest() : null;
    const slowTimer = setTimeout(() => {
      tracker?.markSlow();
    }, slowAfterMs);

    try {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (callerSignal?.aborted) {
          throw getAbortReason(callerSignal);
        }

        const controller = new AbortController();
        let timedOut = false;
        const timeoutError = new RequestTimeoutError();

        const timeoutTimer = setTimeout(() => {
          timedOut = true;
          controller.abort(timeoutError);
        }, attemptTimeoutMs);

        const onCallerAbort = () => {
          if (callerSignal) {
            controller.abort(getAbortReason(callerSignal));
          }
        };

        callerSignal?.addEventListener('abort', onCallerAbort, { once: true });

        let bufferedResponse: Response;
        try {
          const response = await fetchImpl(input, {
            ...init,
            signal: controller.signal,
          });

          const shouldSkipBody =
            method === 'HEAD' || NULL_BODY_STATUSES.has(response.status);
          const body = shouldSkipBody
            ? null
            : await withSignal(response.arrayBuffer(), controller.signal);

          bufferedResponse = new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        } catch (error: unknown) {
          if (callerSignal?.aborted) {
            throw getAbortReason(callerSignal);
          }

          const finalError = timedOut ? timeoutError : error;
          const hasMoreAttempts = attempt < maxAttempts - 1;

          if (canRetry && hasMoreAttempts) {
            tracker?.markRetrying();
            const delayMs = (retryDelaysMs[attempt] ?? 0) + random() * jitterMs;
            await (callerSignal ? withSignal(sleep(delayMs), callerSignal) : sleep(delayMs));
            continue;
          }

          throw finalError;
        } finally {
          clearTimeout(timeoutTimer);
          callerSignal?.removeEventListener('abort', onCallerAbort);
        }

        const hasMoreAttempts = attempt < maxAttempts - 1;
        if (canRetry && isRetryableStatus(bufferedResponse.status) && hasMoreAttempts) {
          tracker?.markRetrying();
          const delayMs = (retryDelaysMs[attempt] ?? 0) + random() * jitterMs;
          await (callerSignal ? withSignal(sleep(delayMs), callerSignal) : sleep(delayMs));
          continue;
        }

        return bufferedResponse;
      }

      throw new RequestTimeoutError();
    } finally {
      clearTimeout(slowTimer);
      tracker?.finish();
    }
  };
}
