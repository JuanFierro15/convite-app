import { InjectionToken } from '@angular/core';
import { Capacitor } from '@capacitor/core';

export interface IntroEnvironment {
  isNativePlatform(): boolean;
  prefersReducedMotion(): boolean;
  prefersLessData(): boolean;
  isPortrait(): boolean;
  hasSeen(code: string): boolean;
  markSeen(code: string): void;
}

export const INTRO_SEEN_KEY_PREFIX = 'convite.intro-visto.';

export const INTRO_ENVIRONMENT = new InjectionToken<IntroEnvironment>('INTRO_ENVIRONMENT', {
  providedIn: 'root',
  factory: () => browserIntroEnvironment(),
});

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

const seenCodesInMemory = new Set<string>();

export function resetIntroMemoryForTests(): void {
  seenCodesInMemory.clear();
}

export function browserIntroEnvironment(): IntroEnvironment {
  return {
    isNativePlatform(): boolean {
      return Capacitor.isNativePlatform();
    },

    prefersReducedMotion(): boolean {
      try {
        return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
      } catch {
        return false;
      }
    },

    prefersLessData(): boolean {
      try {
        const nav =
          typeof navigator !== 'undefined'
            ? (navigator as unknown as { connection?: NetworkInformationLike })
            : undefined;
        const conn = nav?.connection;
        if (!conn) {
          return false;
        }
        return (
          conn.saveData === true ||
          conn.effectiveType === 'slow-2g' ||
          conn.effectiveType === '2g'
        );
      } catch {
        return false;
      }
    },

    isPortrait(): boolean {
      try {
        return window.matchMedia?.('(max-aspect-ratio: 1/1)').matches === true;
      } catch {
        return false;
      }
    },

    hasSeen(code: string): boolean {
      if (seenCodesInMemory.has(code)) {
        return true;
      }
      try {
        return (
          typeof localStorage !== 'undefined' &&
          localStorage.getItem(INTRO_SEEN_KEY_PREFIX + code) === '1'
        );
      } catch {
        return false;
      }
    },

    markSeen(code: string): void {
      seenCodesInMemory.add(code);
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(INTRO_SEEN_KEY_PREFIX + code, '1');
        }
      } catch {
        // Si el almacenamiento local no está disponible, se mantiene solo en memoria.
      }
    },
  };
}

export function shouldOfferIntro(env: IntroEnvironment, code: string): boolean {
  return (
    !env.isNativePlatform() &&
    !env.prefersReducedMotion() &&
    !env.prefersLessData() &&
    !env.hasSeen(code)
  );
}
