import { TestBed } from '@angular/core/testing';
import { Route } from '@angular/router';
import { of } from 'rxjs';
import {
  AudiencePreloadingStrategy,
  INITIAL_PATHNAME,
} from './audience-preloading.strategy';

describe('AudiencePreloadingStrategy', () => {
  function createStrategy(initialPath?: string): AudiencePreloadingStrategy {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AudiencePreloadingStrategy,
        ...(initialPath !== undefined
          ? [{ provide: INITIAL_PATHNAME, useValue: initialPath }]
          : []),
      ],
    });
    return TestBed.inject(AudiencePreloadingStrategy);
  }

  const guestRoute: Route = {
    path: 'i/:code',
    data: { audience: 'guest' },
  };

  const adminRoute: Route = {
    path: 'eventos',
  };

  it('se instancia con la ruta de arranque por defecto', () => {
    const strategy = createStrategy();
    expect(strategy).toBeTruthy();
  });

  describe('arranque en /i/ABCDEFGHJK', () => {
    it('llama a load() en ruta con data.audience = guest y no llama en ruta sin esa marca', () => {
      const strategy = createStrategy('/i/ABCDEFGHJK');
      let guestCalled = false;
      let adminCalled = false;

      strategy.preload(guestRoute, () => {
        guestCalled = true;
        return of(true);
      });

      strategy.preload(adminRoute, () => {
        adminCalled = true;
        return of(true);
      });

      expect(guestCalled).toBe(true);
      expect(adminCalled).toBe(false);
    });
  });

  describe('arranque en /eventos', () => {
    it('las dos rutas llaman a load()', () => {
      const strategy = createStrategy('/eventos');
      let guestCalled = false;
      let adminCalled = false;

      strategy.preload(guestRoute, () => {
        guestCalled = true;
        return of(true);
      });

      strategy.preload(adminRoute, () => {
        adminCalled = true;
        return of(true);
      });

      expect(guestCalled).toBe(true);
      expect(adminCalled).toBe(true);
    });
  });

  describe('arranque en /', () => {
    it('las dos rutas llaman a load()', () => {
      const strategy = createStrategy('/');
      let guestCalled = false;
      let adminCalled = false;

      strategy.preload(guestRoute, () => {
        guestCalled = true;
        return of(true);
      });

      strategy.preload(adminRoute, () => {
        adminCalled = true;
        return of(true);
      });

      expect(guestCalled).toBe(true);
      expect(adminCalled).toBe(true);
    });
  });
});
