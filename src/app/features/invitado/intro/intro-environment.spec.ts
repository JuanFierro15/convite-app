import { Capacitor } from '@capacitor/core';
import {
  IntroEnvironment,
  browserIntroEnvironment,
  resetIntroMemoryForTests,
  shouldOfferIntro,
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

describe('intro-environment', () => {
  describe('shouldOfferIntro', () => {
    it('returns true when all conditions are false', () => {
      const env = fakeEnv();
      expect(shouldOfferIntro(env, 'ABCD1234JK')).toBe(true);
    });

    it('returns false when on native platform', () => {
      const env = fakeEnv({ isNativePlatform: () => true });
      expect(shouldOfferIntro(env, 'ABCD1234JK')).toBe(false);
    });

    it('returns false when reduced motion is preferred', () => {
      const env = fakeEnv({ prefersReducedMotion: () => true });
      expect(shouldOfferIntro(env, 'ABCD1234JK')).toBe(false);
    });

    it('returns false when less data is preferred', () => {
      const env = fakeEnv({ prefersLessData: () => true });
      expect(shouldOfferIntro(env, 'ABCD1234JK')).toBe(false);
    });

    it('returns false when the user has already seen the intro', () => {
      const env = fakeEnv({ hasSeen: () => true });
      expect(shouldOfferIntro(env, 'ABCD1234JK')).toBe(false);
    });
  });

  describe('browserIntroEnvironment', () => {
    let env: IntroEnvironment;

    beforeEach(() => {
      resetIntroMemoryForTests();
      localStorage.clear();
      env = browserIntroEnvironment();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('delegates isNativePlatform to Capacitor', () => {
      const spy = vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
      expect(env.isNativePlatform()).toBe(true);
      spy.mockReturnValue(false);
      expect(env.isNativePlatform()).toBe(false);
    });

    it('does not read or write localStorage when marking and checking seen', () => {
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

      env.markSeen('AAAA');
      expect(setItemSpy).not.toHaveBeenCalled();

      expect(env.hasSeen('AAAA')).toBe(true);
      expect(getItemSpy).not.toHaveBeenCalled();
    });

    it('returns false for hasSeen even if legacy localStorage key is set', () => {
      localStorage.setItem('convite.intro-visto.BBBB', '1');
      expect(env.hasSeen('BBBB')).toBe(false);
    });

    it('marks seen in memory only for the specified code', () => {
      expect(env.hasSeen('AAAA')).toBe(false);
      env.markSeen('AAAA');
      expect(env.hasSeen('AAAA')).toBe(true);
      expect(env.hasSeen('CCCC')).toBe(false);
    });

    it('resets seen codes in memory after resetIntroMemoryForTests', () => {
      env.markSeen('AAAA');
      expect(env.hasSeen('AAAA')).toBe(true);

      resetIntroMemoryForTests();
      expect(env.hasSeen('AAAA')).toBe(false);
    });

    describe('prefersLessData', () => {
      afterEach(() => {
        delete (navigator as unknown as Record<string, unknown>)['connection'];
      });

      it('returns true when saveData is true', () => {
        Object.defineProperty(navigator, 'connection', {
          value: { saveData: true },
          configurable: true,
          writable: true,
        });
        expect(env.prefersLessData()).toBe(true);
      });

      it('returns true when effectiveType is 2g or slow-2g', () => {
        Object.defineProperty(navigator, 'connection', {
          value: { effectiveType: '2g' },
          configurable: true,
          writable: true,
        });
        expect(env.prefersLessData()).toBe(true);

        Object.defineProperty(navigator, 'connection', {
          value: { effectiveType: 'slow-2g' },
          configurable: true,
          writable: true,
        });
        expect(env.prefersLessData()).toBe(true);
      });

      it('returns false when effectiveType is 4g and saveData is false', () => {
        Object.defineProperty(navigator, 'connection', {
          value: { effectiveType: '4g', saveData: false },
          configurable: true,
          writable: true,
        });
        expect(env.prefersLessData()).toBe(false);
      });

      it('returns false when connection is not defined', () => {
        delete (navigator as unknown as Record<string, unknown>)['connection'];
        expect(env.prefersLessData()).toBe(false);
      });
    });

    describe('prefersReducedMotion and isPortrait', () => {
      it('evaluates prefers-reduced-motion media query', () => {
        const spy = vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
          return {
            matches: query.includes('prefers-reduced-motion: reduce'),
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
          } as unknown as MediaQueryList;
        });

        expect(env.prefersReducedMotion()).toBe(true);

        spy.mockReturnValue({
          matches: false,
          media: '',
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        } as unknown as MediaQueryList);

        expect(env.prefersReducedMotion()).toBe(false);
      });

      it('evaluates max-aspect-ratio media query for portrait orientation', () => {
        const spy = vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
          return {
            matches: query.includes('max-aspect-ratio: 1/1'),
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
          } as unknown as MediaQueryList;
        });

        expect(env.isPortrait()).toBe(true);

        spy.mockReturnValue({
          matches: false,
          media: '',
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        } as unknown as MediaQueryList);

        expect(env.isPortrait()).toBe(false);
      });

      it('returns false when matchMedia throws', () => {
        vi.spyOn(window, 'matchMedia').mockImplementation(() => {
          throw new Error('Not supported');
        });

        expect(env.prefersReducedMotion()).toBe(false);
        expect(env.isPortrait()).toBe(false);
      });
    });
  });
});
