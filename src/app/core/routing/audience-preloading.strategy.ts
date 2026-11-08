import { inject, Injectable, InjectionToken } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { Observable, of } from 'rxjs';

export const INITIAL_PATHNAME = new InjectionToken<string>('INITIAL_PATHNAME', {
  providedIn: 'root',
  factory: () =>
    typeof window !== 'undefined' && window.location ? window.location.pathname : '/',
});

@Injectable({ providedIn: 'root' })
export class AudiencePreloadingStrategy implements PreloadingStrategy {
  // El invitado entra por la web desde una red móvil y no necesita las pantallas del equipo; el APK sigue precargando todo.
  private readonly initialPath = inject(INITIAL_PATHNAME);
  private readonly isGuest = this.initialPath.startsWith('/i/');

  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    if (this.isGuest) {
      return route.data?.['audience'] === 'guest' ? load() : of(null);
    }
    return load();
  }
}
