import { newId } from './uuid';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('uuid utils', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('generates valid UUID v4 strings and returns distinct values on consecutive calls', () => {
    const first = newId();
    const second = newId();

    expect(first).toMatch(UUID_V4_REGEX);
    expect(second).toMatch(UUID_V4_REGEX);
    expect(first).not.toBe(second);
  });

  it('falls back to crypto.getRandomValues when crypto.randomUUID is unavailable', () => {
    const getRandomValues = crypto.getRandomValues.bind(crypto);
    vi.stubGlobal('crypto', { getRandomValues });

    const first = newId();
    const second = newId();

    expect(first).toMatch(UUID_V4_REGEX);
    expect(second).toMatch(UUID_V4_REGEX);
    expect(first).not.toBe(second);
  });
});
